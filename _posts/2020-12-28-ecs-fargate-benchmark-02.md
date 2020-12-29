---
layout: page
title: ECS Fagate 성능 측정하기 - 구축부터 Benchmark까지 (중)
writer: 황문주
---

## ECS Fargate 구축하기

이제 실제로 Fargate의 네트워크 성능을 측정하기 위한 준비를 해보겠습니다. 기본적으로 Docker 및AWS IAM credential key가 필요하므로 구축 전 준비 사항을 알고 싶으신 분들은 [ECS 가이드](https://docs.aws.amazon.com/ko_kr/AmazonECS/latest/developerguide/get-set-up-for-amazon-ecs.html)를 참고 하시면 됩니다. 필요한 핵심 내용만 진행하기 위해서 구축 과정도 ECS 개발자 가이드를 최대한 참고 하였으니 가이드를 통해서 직접 실습해 보셔도 좋을 듯 합니다.

### Dockerfile로 이미지 생성

가장 먼저 Dockerfile을 작성하여 도커 이미지를 생성해 보겠습니다. 여기서는 이미지 생성에 필요한 내용만을 언급하고 있으니 Dockerfile을 작성하는 자세한 방법은 [Docker docs](https://docs.docker.com/engine/reference/builder/)를 참고하시면 됩니다.

우선 원하는 이름으로 Dockerfile을 생성할 디렉터리를 하나 만들어 줍니다. 저는 Docker-images 라는 디렉터리를 만들고 그 안에 Dockerfile을 생성했습니다.

```bash
mkdir docker-imgaes
cd docker-images
touch Dockerfile
```

이제 Dockerfile을 작성해 봅시다. 이번 실습에서 작성한 Dockerfile을 예시로 들어 보겠습니다. 저는 ubuntu 18.04를 기본 이미지로 설정했습니다.

```Dockerfile
FROM ubuntu:18.04

ENV DEBIAN_FRONTEND noninteractive
# Install dependencies
RUN apt-get update && \
 apt-get install -y apt-utils && \
 apt-get -y install apache2 && \
 apt-get install -y sysbench && \
 apt-get install -y net-tools

# Configure apache
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf && \
 grep ServerName /etc/apache2/apache2.conf

EXPOSE 80

# Configure apache
RUN echo '. /etc/apache2/envvars' > /root/run_apache.sh && \
 echo 'mkdir -p /var/run/apache2' >> /root/run_apache.sh && \
 echo 'mkdir -p /var/lock/apache2' >> /root/run_apache.sh && \
 echo '/usr/sbin/apache2 -D FOREGROUND' >> /root/run_apache.sh && \
 chmod 755 /root/run_apache.sh

CMD /root/run_apache.sh
```

```Dockerfile
FROM ubuntu:18.04

ENV DEBIAN_FRONTEND noninteractive
# Install dependencies
RUN apt-get update && \
 apt-get install -y apt-utils && \
 apt-get install -y iperf3 && \
 apt-get install -y net-tools

# Configure apache
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf && \
 grep ServerName /etc/apache2/apache2.conf

EXPOSE 5201

CMD iperf3 -s -D
```

총 2개의 Dockerfile을 생성합니다. 하나는 apache를 구동하는 컨테이너, 하나는 네트워크 벤치마크용 컨테이너입니다. 처음에는 하나의 Dockerfile에  모두 넣어서 테스트를 해봤습니다만, Iperf3가 제대로 동작하지 않아서 불가피하게 이미지를 두 개 생성하였습니다.

여기서는 Dockerfile command에 대해 일일이 말씀드리는 것 보다 설명이 필요한 부분만 빠르게 짚고 넘어가도록 하겠습니다.

먼저 기본 우분투 이미지에는 거의 모든 패키지가 설치 되어 있지 않기 때문에 RUN 커맨드를 통해 필요한 패키지를 설치하였습니다. 테스트에 필요한 패키지는 iperf3 와 sysbench 입니다. apt-utils는 패키지 관리 관련, apache2는 웹서버, net-tools는 ifconfig를 동작시키기 위해 설치하였습니다. net-tools는 ifconfig 외에도 netstat, arp, route 등 네트워크 서브시스템 제어를 위한 도구들이 들어있습니다.

다른 Dockerfile에는 iperf3를 통해서 네트워크 대역폭을 측정하기 위한 설정이 들어있습니다. iperf3는 5201포트를 사용하기 때문에 EXPOSE 를 통해서 5201포트를 허용 했습니다. fargate가 구축되고 나서 같은 VPC 내의 EC2 인스턴스를 클라이언트로 삼아 네트워크 대역폭을 테스트할 예정입니다.

이렇게 두 개의 Dockerfile을 모두 작성하였다면 Docker cli를 통해서 이미지를 생성합니다. 다만 Dockerfile이 두 개 이므로 각각 다른 다른 경로에서 이미지를 생성해주시면 되겠습니다.

```bash
docker build -t benchmark-test .
```

-t옵션으로 이미지의 이름을 정하고 도커파일이 있는 디렉토리에서 위의 명령어를 입력하면, 'benchmark-test'라는 이미지가 생성된 것을 확인할 수 있습니다.

![benchmark-test](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-12.png)

### ECR에 이미지 올리기

이미지가 정상적으로 생성 되었다면 ECR에 이미지를 푸시 해보겠습니다.

먼저 AWS CLI로 레포지토리를 생성 해보겠습니다. (AWS CLI를 사용하기 전에 Credential Check가 선행되어야 합니다.)

```bash
aws ecr create-repository --repository-name **[repository-name]** --region **[region-name]**
```

정상적으로 생성 되었는지 확인 후에, 아래와 같이 이미지에 태그를 지정합니다.

```bash
docker tag **[image-name]** **[aws_account_id]**.dkr.ecr.**[region]**.amazonaws.com/**[repository-name]**
```

ECR 접근을 위해 로그인 비밀번호를 부여받고 레지스트리 URI를 지정합니다. 'Login Succeeded'가 나오면 접근이 성공한 것입니다. (Credential 설정이 아닌 다른 오류가 발생하면 AWS CLI를 재설치하거나 업그레이드 해보는 것을 권장 드립니다.)

```bash
aws ecr get-login-password | docker login --username AWS --password-stdin **[aws_account_id]**.dkr.ecr.**[region]**.amazonaws.com
```

![ecr get-login-password](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-13.png)

이제 이미지를 ECR로 푸시합니다. 콘솔에서 푸시된 이미지를 확인할 수 있습니다. iperf3용 컨테이너도 같은 방법으로 이미지를 올려 주시면 되겠습니다.

```bash
docker push **[aws_account_id]**.dkr.ecr.**[region]**.amazonaws.com/**[repository-name]**
```

![pushed image](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-14.png)

### Task Definition 생성

Task Definition을 정의해 보겠습니다. 'Create new Task Definition'을 클릭하면 아래와 같은 선택 화면이 나옵니다. Fargate를 선택하고 'Next step'을 클릭합니다.

![Create New Task Definition](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-15.png)

Task Definition Name과 Task Role을 설정합니다.  여기서는 기본적인 ecsTaskExecutionRole을 사용하였습니다.

![Configure Task](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-16.png)

Task size는 Task에 할당할 메모리와 CPU의 리소스를 결정합니다. 네트워크와 메모리 테스트를 진행하는 동안 태스크 사이즈를 점차 늘려가면서 테스트할 예정입니다.

![Task Size](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-17.png)

Add container에서 ECR에 올렸던 이미지 주소를 통해 컨테이너를 정의할 수 있습니다. 여기서는 Advanced container configuration은 하지 않고 기본적인 설정만 하고 넘어가겠습니다. 컨테이너는 총 2개를 생성하되, Port mappings 에는 웹서버 컨테이너는 80 port, iperf3 컨테이너는 5201 포트를 추가하였습니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-18.png)
![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-19.png)
![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-20.png)

그 외 추가적인 설정은 여기서는 필요 없으니 넘어가도록 하고 Task Definition을 생성합니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-21.png)

### Cluster 생성

곧바로 Cluster를 생성해보겠습니다. ECS 콘솔창에서 'Create Cluster'를 클릭합니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-22.png)

Networking only를 선택하고 다음으로 넘어갑니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-23.png)

클러스터의 이름을 지정하고 클러스터를 생성합니다. 여기서 저는 미리 만들어놓은 VPC를 사용하기 때문에 새로운 VPC는 생성하지 않았습니다. 'Create'를 클릭하면 새로 생성된 클러스터를 확인할 수 있습니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-24.png)

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-25.png)

### Service 생성

Service는 생성된 클러스터에서 만들 수 있습니다. 'Services'탭에서 'Create'를 클릭합니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-26.png)

Launch type은 FARGATE를 선택하고, Revision은 가장 최근으로 선택합니다. (처음 이미지를 업데이트하신다면 1 (latest)로 표시되어 있을 것입니다.) 다음으로 서비스 이름을 입력하고, 태스크의 수를 정합니다. 여기서는 1개로 설정하고 넘어가겠습니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-27.png)

그 외의 설정은 아래와 같이 설정하고 넘어가도록 하겠습니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-28.png)

VPC와 Subnet은 개별적으로 생성하신 환경에 맞추어 설정합니다. 단 Security group은 기존에 허용했던 80포트와 5201포트를 열어주어야 합니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-29.png)

Load balancer는 ALB를 선택합니다. ALB 설정이 네트워크 벤치마크 테스트와 관련이 있는 것은 아니지만, 웹서버가 제대로 구동되는 것을 확인하여 컨테이너의 상태를 체크하려는 목적과 함께 Fargate로 실제 서비스 구축을 간단히 연습해 보려는 목적도 있습니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-30.png)

컨테이너와 ALB는 80포트로 연결해 줍니다. 아무런 추가 설정이 없으므로 Path pattern이나 Health check Path도 기본값으로 진행합니다. 이 외의 다른 설정은 모두 기본값으로 두고 'Next step'을 클릭합니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-31.png)

Auto Scaling은 여기서는 설정하지 않습니다. 다음으로 넘어갑니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-32.png)

서비스 리뷰를 넘어가면 정상적으로 서비스가 생성된 것을 확인할 수 있습니다.

![](/assets/image/posts/2020-12-28-ecs-fargate-benchmark-33.png)
