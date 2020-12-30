---
layout: page
title: AWS fargate 서비스 운영 체험기
writer: 조웅
thumbnail: 'posts/2020-12-24-fargate-01.png'
---

## 도입 배경
때마침 저희 파트에서 사용하는 airflow 때문에 불편을 겪고있던 상황이라, fargate 학습 + airflow 구조 개선 2가지를 목표로 하여 진행하게 되었습니다.

저희 파트는 airflow를 ec2 환경(정확히는 beanstalk)에서 구축, 운영 하면서 몇가지 불편한 상황에 당면하게 되었습니다.

1. 배포 속도

    AWS elastic beanstalk(이하 eb)를 사용 해 보셨다면 아시겠지만,
'배포 시작 → 배포 완료 → health check → 정상 동작 확인'까지 과정이 상당히 느립니다.

1. failover

    airflow는 필수적 기능이 크게 3가지(web, schduler, work)가 있고 각각 HA 구성이 가능한 구조이나, 이를 eb로 운영하기에는 각각을 eb(또는 ec2)로 나눠야하고, 배포 과정의 불편함을 3배로 경험하게 됩니다.

## fargate 도입 전 고려 사항
fargate 사용 하기 위해서는 아래 내용에 대한 이해도가 필요합니다.

- docker
- AWS ECS
- AWS ECR
- AWS EFS
- AWS ALB
- auto scailing
- Terraform(optional)

저는 모두 Terraform을 통해 생성 하였는데, 구축 하면서 느낀 점은 '약간의 진입 장벽이 있다'는 생각이었습니다.
Terraform 옵션이지만 나머지 내용에 대해서는 숙지된 상태에서 진행 하는것을 권합니다.

그리고 비용 측면에서 봤을 때, resource(cpu, memory)를 꼼꼼하게 관리하지 않으면 ec2로 구축한 경우와 비용차이가 크지 않습니다. 만약 누군가 fargate가 비용 측면에서 장점이 있다고 한다면 당장 절교 하시기 바랍니다.

## fargate란?
AWS는 이미 ECS라는 docker 환경 기반 service를 출시한 바 있습니다.
fargate는 ECS에 속해있는 managed service로 다른 AWS managed service와 마찬가지로 ec2를 생성하지 않고 AWS의 hardware resource + user account의 network interface(ENI)를 사용하게 됩니다.
아래는 저희의 fargate 구성도 입니다. DI는 저희 쪽 account name이고, 구성도 내 초록색 음영을 넣은 부분이 fargate에서 생성 및 컨트롤 하는 부분입니다.

![Technical Architecture](/assets/image/posts/2020-12-24-fargate-01.png)

위에 언급한 것 처럼 fargate로 실제 docker container는 AWS resource 안에서 동작하도록 되어있고, user가 만든 VPC의 ENI에 연결 되어 접근할 수 있는 구조입니다. 생성된 container에 대해 로드밸런싱이 가능하도록 fargate에서 container 생성할 때 생성된 ENI의 private IP를 특정 target group에 등록하는 기능이 포함 되어있습니다.

## fargate를 이용한 airflow 구축

내용의 중심이 airflow는 아니어서 간단하게 구성도와 함께 필요한 내용들만 공유 드리겠습니다. CeleryExecutor 기능을 사용하였고, task broker로 redis(elasticache)를 적용하였습니다.

![Airflow Service Architecture](/assets/image/posts/2020-12-24-fargate-02.png)

web UI를 제공하는 web server와 flower만 ALB를 통해 접근 할 수 있도록 하였습니다. 여기서 한가지 문제가 발생 하였는데, 서두에 언급 했던 배포 문제입니다.

## Git-sync (Sidecar Pattern)

구성도를 집중해서 보셨다면 EFS가 포함 되어있는것을 확인 하셨을거라 생각합니다. EFS가 있는 이유는 이번에 설명 드릴 Sidecar Pattern을 사용하기 위해서였습니다.

Sidecar Pattern을 사용하게 된 이유는

1. 패치 때마다 dag 소스 파일을 container image에 밀어 넣기 위해 dockerfile build를 하는 과정을 피하고
1. airflow의 dag 소스를 모든 airflow container에 일관되게 반영하기 위해

...적용하게 되었습니다. 쉽게 말해 dag 소스 배포 때 손이 덜가게 하고 싶었습니다.

![Git-sync Sidecar Pattern 구성도](/assets/image/posts/2020-12-24-fargate-03.png)

위 처럼 airflow dags 및 task 파일이 있는 git repository에 계속 git pull을 시도 하는 container를 두고 해당 컨테이너에 EFS volume을 mount 합니다. 해당 volume은 각 airflow container의 dags 디렉토리에 마운트 해 두면 user가 git push를 하고 10초 이내 git-sync container에서 git pull이 되는 순간 모든 container가 업데이트 된 소스를 보게 됩니다.

참고로 이 기능은 airflow를 k8s 환경에서 사용할 경우 옵션으로 제공하는 기능이긴 합니다만, git sync 하는 script가 복잡하진 않아서 직접 작성하여 docker entrypoint로 등록하였습니다. 

## Terraform을 써서 편했나?

제가 생각하는 terraform의 장점은 module화를 잘 해두면 dev, qa, stage, prod 환경 모두 코드를 복붙(?)하여 일관되게 관리할 수 있다는 것입니다. 하지만 편리함 뒤에는 단점도 존재 했는데, ECS는 생성 할 때 모든 설정 값들을 task definition json에 선언 하면 되지만, terraform에서는 코드에 몇몇 값들을 required value로 선언해야 한다는 점이었습니다. 대표적인 예가 cpu, memory limit 값이었습니다.

```
module "task_def_airflow_webserver" {
  source = "../../../../../modules/ecs/task_definition_for_fargate_with_efs"

  family = "${local.stage}-airflow-webserver"
  cpu = "512"
  memory = "1024"
  role_arn = data.terraform_remote_state.service_profile_iam_role.outputs.role_arn
  container_definitions = data.template_file.airflow_webserver.rendered

  file_system_id = data.terraform_remote_state.efs.outputs.id
  root_directory = "/${local.repo_name}/"
}
```

처음에 그냥 ECS 설정 하듯이 모든 설정들을 task definition json에 넣어두고 json파일만 넘겨서 task definition 생성을 시도하다 원인을 찾기 못해 시간을 허비 해버렸습니다.

service 생성 시에는 platform version(추측으로는 fargate에 배포되는 container가 속한 하드웨어 그룹을 versionig 했을 것으로 예상됩니다.)을 지정할 때 'latest'로 지정해도 실제 최신 버전(2020년 11월, terraform 0.13 기준)인 1.4.0가 아닌 1.3.0으로 생성 됩니다. EFS를 mount하기 위해서는 platform version 값을 1.4.0로 지정해 줘야 합니다.

fargate를 terraform으로 관리하실 예정이라면 꼭 terraform과 AWS document를  꼼꼼히 정독하시길 바랍니다.

## 보안

fargate는 ECS service 단위로 security group, IAM role 적용이 가능하여 기존 ec2 auto scailing 환경과 동일 한 방식으로 권한 및 접근 관리가 가능하고, ENI private IP를 target group에 attach하여 ALB, NLB 사용이 가능하므로 AWS WAF등 L7 layer의 보안 관리도 가능 합니다. 개발자 입장에서는 앞서 언급한 보안 기능들을 EKS에 적용하는것보다 fargate에 적용하는 방법은 편리합니다.

## Container Monitoring

예전에 docker로 서비스를 할 때 resource(cpu, memory) 및 log 모니터링을 위해 별도의 agent를 심어야 한다는  점이 불편함이 있었습니다.

fargate는 service 단위로 cloudwatch metric(cpu, memory) 제공하고 container log를 cloudwatch logs를 통해 확인 및 알람 설정이 가능 하기 때문에 편리한 부분이 있습니다. 다만 metric은 container 단위로는 제공하지 않고, java를 예로 들면 JVM 레벨의 세부적인 memory 사용율을 확인하고 싶을때 결국 다른 방법을 택해야 하는 불편함은 존재 합니다.

## 비용...그것이 문제로다

EKS(k8s) pod 생성 시 yml파일에 cpu, memory의 limit를 지정할 수 있듯이, fargate도 task definition 생성 시 vCPU와 memory의 limit를 지정할 수 있고 cpu, memory 단위로 비용이 책정 되어있습니다(RI도 가능). 여기서 fargate의 최대 단점 이라 할수 있는 비용 문제가 발생합니다. 이유는 아래 표를 보시만 짐작이 가능 하실겁니다.

| CPU 값 | 메모리 값 |
|---|---|
| 256(.25 vCPU) | 0.5GB, 1GB, 2GB |
| 512(.5 vCPU) | 1GB, 2GB, 3GB, 4GB |
| 1024(1 vCPU) | 2GB, 3GB, 4GB, 5GB, 6GB, 7GB, 8GB |
| 2048(2 vCPU) | 1GB 단위로 4GB ~ 16GB 사이 |
| 4096(4 vCPU) | 8GB ~ 30GB(1GB 단위) |

Ref : [Task CPU and memory](https://docs.aws.amazon.com/ko_kr/AmazonECS/latest/developerguide/AWS_Fargate.html)

위 표에 나와있듯이 설정할 수 있는 resource 단위가 정해져 있으며, 설정 가능 최소 memory = (vCPU 계수 * 2048MB)가 됩니다. 모든 서비스 프로세스가 memory를 더 많이 사용하는 것이 아니기 때문에 프로세스가 memory 사용 대비 cpu사용이 높다면 fargate는 비용적으로 불리합니다.

비용적으로 봤을 때 'fargate는 과연 운영할 서비스에 맞는 선택인가?'를 판단해 보시길 바랍니다.

## 마치며

제 개인적으로 fargate를 EKS의 대안으로 쓴다면 node group 관리 포인트와 시간적, 정신적 스트레스가 줄어드는것이 가장 큰 장점이라고 봅니다. 애당초 managed service의 특성이 '편리하지만 싸진 않단다'이라는 생각을 갖고 있었기 때문에 비용은 전혀 기대 하지 않았고, 그래서 장점이 와 닿지 않았나 생각이 듭니다. 비용에 대한 내용에서 언급 했듯 resource(cpu, memory) 사용량이 fargate 비용 모델과 부합한다면 EKS의 좋은 대안이 될 수 있을거라 생각 됩니다.

