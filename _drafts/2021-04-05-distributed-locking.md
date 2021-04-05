---
layout: page
title: '모든 돈은 빌링으로 흐른다 : Redisson을 활용한 분산 락 처리'
writer: ['정석', '주인재']
description: "멀티서버 환경에서 동시성 보장을 위해 Redisson으로 분산 락을 구현해 보았습니다."
tags: ['Java', 'Spring Boot', 'Redisson']
thumbnail: 'posts/2021-03-22-learning-transferable-visual-models/4.png'
---

# 모든 돈은 빌링으로 흐른다.

빌링 파트의 첫 목표는 "신상마켓의 모든 돈은 빌링으로 통(通)하라"였습니다. 즉, 고객이 결제하는 모든 돈에 대한 처리 및 관리를 빌링파트의 시스템를 통해 처리하고자 했습니다. 그 중 가장 문제가 되는 부분을 기존의 포인트로 판단하고, 포인트의 구조적 변경과 빌링 서버에 단일화를 목표로 프로젝트를 진행하였습니다.
해당 프로젝트를 진행하면서 겪었던 문제점 중 **동시성 처리에 대한 Lock**에 대한 내용을 공유하려고 합니다.

# 당면한 문제점

기존 레거시 포인트 사용 프로세스를 설명하자면 사용자가 광고 상품을 신청했을 때 광고 신청 프로세스를 태운 뒤 해당 API에서 포인트를 차감하는 형태였습니다. 광고 상품만 해도 여러 개가 있었고 각각 광고 상품 API마다 포인트에 대한 유효성 검사나 포인트 사용 로직에 중복 코드들이 산재해 있었습니다. 포인트 관련해서 수정사항이 생길 때면 포인트를 사용하는 모든 소스를 뒤져 수정해야 하는 말도 안 되는 상황이 발생하고 있었습니다.

### 기존 레거시 포인트 사용 예시

![](/assets/image/posts/2021-04-05-distributed-locking/legacy_point_process.png)

포인트에 대한 역할을 결제 서버에 위임함으로써 포인트 관련 API를 결제 서버에서 제공하는 형태로 변경하였고, 포인트를 결제 서버에서만 처리하도록 수정하여 중복 코드 제거 및 유지 보수 향상을 꾀하였습니다.

### 변경 후 포인트 사용예시

![](/assets/image/posts/2021-04-05-distributed-locking/point.png)

하지만 또 다른 문제에 직면했는데, 바로 기존 레거시 시스템에 경우 동시성 문제에 대해 고려가 되어있지 않았다는 점이었습니다. 여러 개의 트랜잭션이 연거푸 요청될 수 있어 포인트가 정상적으로 차감되지 않는 문제가 간헐적으로 발생하였습니다. 이러한 동시성 문제를 해결하기 위해 여러 가지 방법을 시도해 보았습니다.

# 해결방법

### Java synchronized

트랜잭션 동기화 처리를 위해 가장 먼저 떠오른 것은 바로 `synchronized`였습니다. Multi-Thread로 인하여 동기화를 제어해야 할 때 자바에서 제공되는 키워드로 공유 데이터에 Lock을 걸어서, 먼저 작업 중이던 스레드가 작업을 완전히 끝낼 때까지는 다른 스레드에게 제어권을 넘겨주지 않아 보호함으로 스레드 동기화를 가능하게 합니다. 
즉 `synchronized` 블록은 한 번에 하나의 스레드만 실행될 수 있습니다.

하지만 결제 서버는 AWS Elastic Beanstalk 환경으로 수시로 auto scaling이 이뤄지고 있으며, HA 구성을 위해 최소 인스턴스는 2개로 설정되어 있습니다. 단일 서버일 경우 `synchronized` 처리로 동시성 문제를 해결할 수 있으나 현재 결제나 서버 구조상 적용해도 동시성 문제를 해결할 수 없었습니다.

### MySQL Internal Locking

다음으로 고려되었던건 MySQL Internal Locking 입니다.
MySQL 내부 Lock은 멀티 세션에서 데이터에 동시성 처리를 위해 MySQL 서버에서 사용되는 Lock입니다.
총 3가지의 Lock이 제공되고 있습니다.

- Row-Level Locking
- Table-Level Locking
- User-Level Locking

Row-Level Locking은 Row 수준으로 Locking을 하는 것이고,
Table-Level Locking은 개별 테이블 단위로 설정되는 Locking입니다.
저희는 User-Level Locking을 이용하기로 결정하였습니다.
User-Level Locking은 사용자가 지정한 문자열에 대해 키를 생성하고 해당 키로 잠금을 거는 방식입니다.
다음은 MySQL에서 User Lock을 위해 제공해 주는 메소드입니다.



| Name                                                         | Description                                                  |
| :----------------------------------------------------------- | :----------------------------------------------------------- |
| [`GET_LOCK()`](https://dev.mysql.com/doc/refman/5.7/en/locking-functions.html#function_get-lock) | Get a named lock                                             |
| [`IS_FREE_LOCK()`](https://dev.mysql.com/doc/refman/5.7/en/locking-functions.html#function_is-free-lock) | Whether the named lock is free                               |
| [`IS_USED_LOCK()`](https://dev.mysql.com/doc/refman/5.7/en/locking-functions.html#function_is-used-lock) | Whether the named lock is in use; return connection identifier if true |
| [`RELEASE_ALL_LOCKS()`](https://dev.mysql.com/doc/refman/5.7/en/locking-functions.html#function_release-all-locks) | Release all current named locks                              |
| [`RELEASE_LOCK()`](https://dev.mysql.com/doc/refman/5.7/en/locking-functions.html#function_release-lock) | Release the named lock                                       |



### User-Level Locking 예시

```sql
-- CONNECTION 1 --
-- connection1에서 'point_user1'라는 이름으로 lock을 획득
mysql> SELECT GET_LOCK('point_user1', 2);
+-----------------------------+
|   GET_LOCK('point_user1',2) |
+-----------------------------+
|                           1 |  -- 정상적으로 lock 획득
+-----------------------------+

-- CONNECTION 2
-- connection2에서 'point_user1'라는 이름으로 lock을 획득
mysql> SELECT GET_LOCK('point_user1', 2); 
+-----------------------------+
|   GET_LOCK('point_user1',2) |                             
+-----------------------------+
|                           0 |  -- 2초 대기후 lock 획득 실패
+-----------------------------+

-- CONNECTION 1
-- connection1에서 'point_user1'를 lock을 해제한다.
mysql> SELECT RELEASE_LOCK('point_user1');
+-----------------------------+
| RELEASE_LOCK('point_user1') |
+-----------------------------+
|                           1 | -- 정상적으로 lock을 해제
+-----------------------------+
1 row in set (0.00 sec)

-- CONNECTION 2
mysql> SELECT GET_LOCK('point_user1',2);
+-----------------------------+
|   GET_LOCK('point_user1',2) |
+-----------------------------+
|                           1 |  -- 정상적으로 lock 획득
+-----------------------------+
1 row in set (0.00 sec)

```

![](/assets/image/posts/2021-04-05-distributed-locking/mysql_internal_lock_example.png)

MySQL Internal Locking을 사용하면 다수 서버에서 동시성 문제를 해결할 수 있습니다. 하지만 MySQL을 Internal Locking은 동일 커넥션에서 `GET_LOCK`을 여러 번 시도할 경우 동일한 키로 여러 번 Lock을 잡습니다. (MySQL 5.7 이상 버전일 경우)

```sql
-- CONNECTION 1 --
mysql> SELECT GET_LOCK('user1', 2); -- return 1
mysql> SELECT GET_LOCK('user1', 2); -- return 1
mysql> SELECT RELEASE_LOCK('user1'); -- return 1

-- CONNECTION 2 --
mysql> SELECT GET_LOCK('user1', 2);  -- lock 획득 실패

-- 중첩된 'user1' lock 해제 후 락 획득 성공 예시
-- CONNECTION 1 --
mysql> SELECT RELEASE_LOCK('user1'); -- return 1

-- CONNECTION 2 --
mysql> SELECT GET_LOCK('user1', 2);
+----------------------+
| GET_LOCK('user1', 2) |
+----------------------+
|                    1 |
+----------------------+
1 row in set (0.00 sec)
```

즉, 동일한 커넥션에서 중첩된 키로 Lock을 획득할 경우 획득한 `GET_LOCK` 카운트만큼 `RELEASE_LOCK`을 해주어야만 다른 Connection에서 Lock을 획득할 수 있습니다. 결제 애플리케이션은 Spring Boot Framework로 기본적으로 HikariCP로 DBCP를 관리하고 있습니다. 위에 예시를 통해 알 수 있듯 결제 애플리케이션에서 `GET_LOCK`을 수행한 Connection과 `RELEASE_LOCK`을 수행하는 Connection이 동일함을 보장해 줘야 합니다. 또한 기존 데이터베이스 설정과 별도로 MySQL 내부 Lock 용 데이터베이스 설정을 둬야 한다는 점에 있어서 개발 리소스 및 유지 보수가 좋다고 판단하지 않아 다른 솔루션을 찾아보기로 하였습니다.

# Redisson

마지막으로 이번에 채택하게 된 Redisson은 여러 서버에 공통된 Lock을 처리하기 위해 Redis를 활용한 라이브러리입니다.
Redisson을 이용하여 개발비용을 절감할 수 있고 비즈니스 로직에 더 집중할 수 있었습니다.
Github Repository를 보면 지속적으로 유지 보수 되고 있음을 알 수 있고 많은 레퍼런스가 존재합니다.
또한 AWS Elastic Cache를 지원하고 있어 AWS 환경을 사용하고 있는 회사 특성상 관리하기 용이하다 판단되었습니다.

- [Github Repository](https://github.com/redisson/redisson)

![](/assets/image/posts/2021-04-05-distributed-locking/github-merge.png)

## Redisson 사용법

그럼 본격적으로 공식 문서를 토대로 Redisson 사용법을 간략히 알아보겠습니다.

### Dependency 등록

Maven, Gradle, SBT 등 여러가지 Build 툴을 지원합니다. Maven, Gradle만 소개해드리겠습니다.

- Maven

    ```xml
    <dependency>
      <groupId>org.redisson</groupId>
      <artifactId>redisson</artifactId>
      <version>3.15.2</version>
    </dependency>
    ```

- Gradle

    ```
    compile 'org.redisson:redisson:3.15.2'
    ```

### config 객체 생성

Config를 불러오는 방법엔 2가지가 있습니다.

#### Programmatically Configuration

객체를 생성한 뒤에 코드 레벨에서 Config을 설정해 주는 방법입니다.

```java
// default 설정으로 생성
Config config = new Config();

// config 객체를 호출하며 원하는 설정을 셋팅한다.
config.setTransportMode(TransportMode.EPOLL);
config.useClusterServers()
      .addNodeAddress("perredis://127.0.0.1:7181");
```

#### Declarative Configuration

yaml 파일을 통해 설정을 불러오는 방법입니다.

Static Factory Method를 이용하여 yaml으로 작성된 설정 파일을 불러들어 Config 객체를 생성할 수 있습니다.

```java
config = Config.fromYAML(new File("config-file.yaml"));
```

### Redisson 접근할 수 있는 객체 생성

설정한 Config를 바탕으로 Redisson에 접근할 수 있는 객체를 획득해야 합니다. 마치 JDBC Driver에서 Connection 얻는 방법같죠?

코드는 다음과 같습니다.

```java
RedissonClient redisson = Redisson.create(config);
```

만약에 Default 설정을 원하신다면 Config Argument를 입력하지 않고 작성해 주시면 됩니다.

```java
RedissonClient redisson = Redisson.create();
```

`Redisson.create()` 메소드를 살펴보면 다음처럼 되어있죠.

```java
public static RedissonClient create() {
  Config config = new Config();
  config.useSingleServer().setAddress("redis://127.0.0.1:6379");
  return create(config);
}
```

참고로 디폴트 설정은 Local Redis로 접속합니다.

### Lock, Unlock 설정

Redisson에서 Lock 객체를 얻고, Lock 객체로 Key 값에 대한 접근 제어를 해주어야 합니다.

#### Key값에 대해 Lock 객체 획득

```java
RLock lock = redisson.getLock("myLock");
```

`myLock`이라는 키를 가진 Lock 객체를 얻는 Expression입니다.

#### Lock 객체로 Key값에 대한 접근 제어

이때, Lock하는 방법은 총 3가지가 있죠.

##### **현대적인 방법(Traditional Lock Method)**

```java
lock.lock();
lock.unlock();
```

너무 간단하죠? 그래서 이 코드를 보고 다음과 같은 질문들이 떠오를 수 있습니다.

Q1. **만약에 Thread가 Crash나면 어떻게 하나요?**

일정 시간이 지나면 Lock을 해제하도록 설계되어 있습니다.

Q2. **일정 시간이 지나 Lock을 해제한다면, Thread가 정상적으로 로직을 처리하는 중에도 lock이 해제될 수 있는 것 아닌가요?**

락 해제 시간을 유연하게 조정할 수 있도록 Watching Dog이라는 걸 이용합니다. Watching Dog은 Thread가 살아있는지 확인합니다. 그리고 살아있다면 Lock Expiration을 늘려주죠. 보통 Watching Dog의 Expire Time은 기본적으로 30초로 설정되어 있습니다.

##### 해제 시간을 명시해주는 방법

특정 시간이 지나면 반드시 해제할 수 있도록 설정하는 방법도 있습니다.

```java
lock.lock(10, TimeUnit.SECONDS);
```

10초 뒤에 Lock을 해제하도록 명시해주는 메소드 호출입니다.

#####(3) 획득할 때까지 대기 시간까지 지정해주는 방법

`lock.tryLock` Method의 첫 번째 인자엔 Lock을 얻기 위해 최대 언제까지 기다릴 것인지에 대한 값을 입력하시면 되고, 두 번째는 Lock 해제 시간에 대한 값을 입력해 주시면 됩니다.

```java
boolean res = lock.tryLock(100, 10, TimeUnit.SECONDS);
if (res) {
   try {
     ...
   } finally {
       lock.unlock();
   }
}
```

Lock을 했다면 Response는 `true`, 못했다면 `false`를 반환합니다. Lock을 얻었을 경우엔 `try` 구문에서 비즈니스 로직을 수행하고, `finally` 부분에서 Lock을 풀 수 있도록 합니다.

# Lock 테스트 - 1

## **주안점 - Synchronization 3요소**

1. Mutual Exclusion: Critical Section에 오직 한 스레드만 진입하라.
2. Progress: Critical Section에 진입할 스레드의 결정은 유한 시간 내에 이루어져야 한다.
3. Bounded Wating: Critical Section에 진입할 스레드가 있다면 어느 스레드라도 유한 시간 내 진입 가능 해야한다.

Synchronization Property인 위 세 가지에 주의하여 테스트를 진행하겠습니다.

## **테스트 진행방식**

Redisson에서 지원하는 Lock이 위 세 가지 조건에 부합하는지 간단히 테스트를 해보겠습니다.

테스트는 다음과 같이 진행합니다.

1. 하나의 스레드를 하나의 서버라고 본다.
2. MySQL에 해당하는 객체를 생성한다.
3. MySQL의 상태 값을 1 증가시키는 로직을 1만번 수행한다. (충분히 Sync 문제가 발생할 수 있도록 1만번으로 설정)
4. 스레드 두 개를 생성하여 위 로직을 수행하도록 한다.
5. Redisson 미적용 버전, Redisson적용 버전 두 가지를 실행하여 비교한다.

테스트의 예상 결과는 Redisson 미적용 버전은 20,000 이하의 숫자가 나와야 할 것이며, 적용 버전은 딱 20,000이 나와야 할 것 입니다.

## 테스트 구현

### 공통 로직: MySQL에 해당하는 클래스

```java
class Mysql {
    private int cash;

    public void addCash(int amount) {
        this.cash += amount; //critical section
    }

    public int cash() {
        return this.cash;
    }
}
```

Cash 변수를 변경하려는 `this.cash += amount` 부분이 바로 Critical Section이 되겠습니다.

### Redisson 미적용한 테스트

### Redisson 미적용 AsyncServer Class

```java
class AsyncServer extends Thread {
    private final Mysql mysql;
    private static final int REP = 10000;

    public AsyncServer(Mysql mysql) {
        this.mysql = mysql;
    }

    @Override
    public void run() {
        for (int i = 0; i < REP; i++) {
            mysql.addCash(1);
        }
    }
}
```

### Main - 실행

```java
public static void main(String[] args) throws InterruptedException {
  Mysql mysql = new Mysql();
  AsyncServer server1 = new AsyncServer(mysql);
  AsyncServer server2 = new AsyncServer(mysql);

  server1.start();
  server2.start();
  server1.join();
  server2.join();

  System.out.println(mysql.cash());
}
```

### 결과

![](/assets/image/posts/2021-04-05-distributed-locking/Untitled.png)

난리 났네요;;; 두 번 더 시도해 봤지만 104,862, 120,791 값이 나옵니다. 예상대로 Sync 문제가 발생했습니다.

### Redisson 적용한 테스트

### Redisson 적용 SyncServer Class

```java
class SyncServer extends Thread {
    private final Mysql mysql;
    private final RedissonClient redisson;
    private static final int REP = 10000;
    private static final String LOCK_KEY = "test";

    SyncServer(Mysql mysql) {
        this.mysql = mysql;
        this.redisson = Redisson.create();
    }

    @Override
    public void run() {
        RLock lock = redisson.getLock(LOCK_KEY);

        for (int i = 0; i < REP; i++) {
            lock.lock(); // (1)
            mysql.addCash(1); // (2)
            lock.unlock(); // (3)
        }

        redisson.shutdown();
    }
}
```

1. Critical Section에 진입하기 전, 오직 자기 자신만 들어갈 수 있도록 Lock을 걸어줍니다.
2. Critical Section 부분을 처리한 뒤,
3. 대기 중인 다른 스레드가 진입할 수 있도록 Lock을 풀어줍니다.

### Main

```java
public static void main(String[] args) throws InterruptedException {
  Mysql mysql = new Mysql();
  SyncServer server1 = new SyncServer(mysql);
  SyncServer server2 = new SyncServer(mysql);

  server1.start();
  server2.start();
  server1.join();
  server2.join();

  System.out.println(mysql.cash());
}
```

### 결과

![](/assets/image/posts/2021-04-05-distributed-locking/thread-sync-result.png)

와우! 딱 2만이 나왔습니다. Redisson으로 Sync 문제를 해결했네요! 여러 번 시도해도 2만이 나옵니다.

### 테스트 한계점

위 테스트는 동일 호스트, 하나의 App 환경에서 Sync 테스트는 통과했다고 볼 수 있습니다. 하지만, 실제 운영 환경을 담아내진 못했습니다. **서로 다른 호스트**에서 돌아가는 App끼리 Sync가 맞느냐? 에 대한 답은 주지 못하죠.

따라서, 쿠버네티스를 이용하여 서로 다른 호스트에서 동작 중인 Spring Boot App끼리에서도 동기화처리가 잘 되는지 테스트해보겠습니다.

# Lock 테스트 - 2

Spring Boot 인스턴스들을 생성한 뒤, 각각 MySQL, Redis에 연결할 겁니다. 그리고 해당 인스턴스들에게 요청을 보내준 뒤 MySQL에 저장된 데이터를 볼 것이지요. 테스트 성공, 실패 조건은 위와 동일합니다.

## 테스트 환경

1. MacOS 11.2.3
2. Minikube 1.18.1
3. Kubernetes 1.20.2

## 환경 구성

![](/assets/image/posts/2021-04-05-distributed-locking/sync_test_diagram_-_v2.png)

구성요소들인 Spring Boot, Redis, MySQL, Ubuntu(Client)의 환경을 어떻게 설정했는지, 왜 그렇게 설정했는지 순서대로 말씀드리겠습니다.

(한편으로, 클러스터 내부에서만 테스트할 것이므로 서비스는 ClusterIP Type으로 설정해두었습니다.)

### Spring Boot

멀티 호스트를 구현하기 위해 Replica 3개를 적용합니다.

하나의 URL로 요청을 받고, 각 Pod에 요청을 분산하기 위해 Service Object를 생성했습니다.

### spring-deployment.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: spring-svc
spec:
  ports:
    - name: web-port
      port: 80
      targetPort: 8080
  selector:
    app: spring-boot
  type: ClusterIP
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spring-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: spring-boot
  template:
    metadata:
      name: my-spring-boot-pod
      labels:
        app: spring-boot
    spec:
      containers:
        - name: my-spring-boot-container
          image: payment/spring
          imagePullPolicy: Never
          ports:
            - containerPort: 8080
```

### Redis + Mysql

각각 서비스 명으로 Pod를 접근할 수 있도록 ClusterIP를 입력하지 않았습니다. 각 서비스의 이름을 `redis`, `mysql`로 정하였습니다.

### **redis-deployment.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  ports:
    - port: 6379
  selector:
    app: redis
  clusterIP: None
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-deployment
spec:
  selector:
    matchLabels:
      app: redis
  replicas: 1
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: master
          image: redis
          resources:
            requests:
              cpu: 100m
              memory: 100Mi
          ports:
            - containerPort: 6379
```

### mysql-pv.yaml

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: mysql-pv-volume
  labels:
    type: local
spec:
  storageClassName: manual
  capacity:
    storage: 20Gi
  accessModes:
    - ReadWriteOnce
  hostPath:
    path: "/mnt/data"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mysql-pv-claim
spec:
  storageClassName: manual
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 20Gi
```

### mysql-deployment.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql
spec:
  ports:
    - port: 3306
  selector:
    app: mysql
  clusterIP: None
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mysql-deployment
spec:
  selector:
    matchLabels:
      app: mysql
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - image: mysql:5.6
          name: mysql
          env:
            - name: MYSQL_ROOT_PASSWORD
              value: password
          ports:
            - containerPort: 3306
              name: mysql
          volumeMounts:
            - name: mysql-persistent-storage
              mountPath: /var/lib/mysql
      volumes:
        - name: mysql-persistent-storage
          persistentVolumeClaim:
            claimName: mysql-pv-claim
```

### Ubuntu

내부 환경에서 테스트하기 위해 Ubuntu Pod를 생성합니다. 이 Pod에서 Spring Boot에 요청을 전송하고 MySQL에 접속하여 테스트 결과를 확인할 것입니다. 클라이언트 역할만 하므로 Service는 따로 두지 않았습니다.

### ubuntu.yaml

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ubuntu
  labels:
    app: ubuntu
spec:
  containers:
    - image: ubuntu
      command:
        - "sleep"
        - "604800"
      name: ubuntu
  restartPolicy: Always
```

구성이 완료된 Object의 모습은 다음과 같습니다.

**Deployment Objects**

![](/assets/image/posts/2021-04-05-distributed-locking/kubectl-get-deployments.png)

**Service Objects**

![](/assets/image/posts/2021-04-05-distributed-locking/kubectl-get-services.png)

**Pods Objects**

![](/assets/image/posts/2021-04-05-distributed-locking/kubectl-get-pods.png)

## 테스트 방법

1. Ubuntu Pod에서 Spring Boot Service로 특정 `user_id`의 캐시를 1원 만큼 적립해달라는 요청을 보냅니다. 이 때, 동시에 여러 개의 요청을 보내야 하므로 Multi-Thread를 이용합니다.
2. MySQL에 저장된 값을 확인합니다. 테스트의 성공/실패 조건은 위와 동일합니다. 보낸 횟수보다 캐시가 더 적다면 동기화가 실패했다는 것이고, 동일하다면 동기화에 성공한 것입니다.

## 테스트 설정

테스트를 구현하기 위한 App별 구현을 말씀드리겠습니다.

### 1. MySQL

### **테이블 구조**

테스트 DB 명은 `users`이며, Column은 단순하게 `user_id`와 `cash`가 들어가 있습니다.

테스트할 유저 명은 `test` 이며 0원 있다고 가정하겠습니다.

![](/assets/image/posts/2021-04-05-distributed-locking/mysql_table.png)

### 2. Spring boot

### App의 기능

1. 캐시를 적립해 달라는 요청을 받습니다. 이 때, 파라미터로는 적립 대상 `userId`와 적립할 `cash`를 받습니다.
2. 그리고 요청받은 금액만큼 현재 남아있는 캐시와 더한 뒤 DB에 저장합니다.

### Redisson

```xml
<dependency>
			<groupId>org.redisson</groupId>
			<artifactId>redisson-spring-boot-starter</artifactId>
			<version>3.15.2</version>
</dependency>
```

이 Dependecy를 등록하면 편하게 Redisson을 사용할 수 있습니다. yaml 파일로 Config을 작성만 해주면 해당 설정을 적용한 RedissonClient를 Spring Boot에서 알아서 생성해 줍니다.

```java
@Autowired
public CashController(CashService cashService, RedissonClient redissonClient) {
  this.cashService = cashService;
  this.redissonClient = redissonClient;
}
```

RedissonClient가 구현 클래스 없이 인터페이스만 존재하지만, 의존성 주입이 되죠!

설정은 Default를 이용할 것입니다.

단, Redis Host 설정은 따로 해두어야 합니다. 외부에 존재하는 Redis에 접근해야 하니까요. 따라서 `application.properties`에서 다음처럼 설정해 두었습니다.

```
spring.redis.host=redis
spring.redis.port=6379
```

Redis Service Object에 연결된 Pod가 1개만이 있고, ClusterIP를 정해주지 않았으므로 Service Name만 작성해 주었습니다.

### Controller

비교 테스트를 위해 동기화 미처리/처리하는 메소드를 2개 만들었습니다.

동기화 처리 시, `userId`를 Key로 두어 Lock을 걸어줍니다. 그리고 나서 Critical Section을 처리하도록 하는 것이죠.

```java
package com.example.demo;

import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.InetAddress;
import java.net.UnknownHostException;

@RestController
public class CashController {
    private final CashService cashService;
    private final RedissonClient redissonClient;

    @Autowired
    public CashController(CashService cashService, RedissonClient redissonClient) {
        this.cashService = cashService;
        this.redissonClient = redissonClient;
    }

		//동기화 미적용
    @PostMapping(path = "async/cash")
    public ResponseEntity<Object> asyncSave(@RequestParam String userId, @RequestParam int amount) {
        cashService.save(userId, amount); //비즈니스 로직 처리

        return new ResponseEntity<>(HttpStatus.ACCEPTED);
    }

		//동기화 적용
    @PostMapping(path = "sync/cash")
    public ResponseEntity<Object> syncSave(@RequestParam String userId, @RequestParam int amount) {
        RLock lock = redissonClient.getLock(userId);

        lock.lock();
        cashService.save(userId, amount);
        lock.unlock();

        return new ResponseEntity<>(HttpStatus.ACCEPTED);
    }
}
```

### Service

해당 `userId`에게 전달받은 액수만큼 캐시를 적립하도록 합니다.

```java
package com.example.demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CashService {
    private final UserRepository userRepository;

    @Autowired
    public CashService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public void save(String userId, int amount) {
        User user = userRepository.findById(userId).get();
        user.saveCash(amount);
        userRepository.save(user);
    }
}
```

### Entity

캐시를 적립해 주는 기능을 노출시켜 줍니다.

```java
package com.example.demo;

import javax.persistence.*;

@Entity
@Table(name = "users")
public class User {
    @Id
    @Column(name = "user_id")
    private String userId;

    private int cash;

    public String getUserId() {
        return userId;
    }

    public int getCash() {
        return cash;
    }
		//캐시 적립
    public void saveCash(int amount) {
        cash += amount;
    }
}
```

### Client (Ubuntu)

요청을 처리해 주는 코드를 작성하고 실행해 줍니다.

Python의 `requests` 모듈을 이용하여 요청 작업을 수행했으며, 동시에 여러 요청을 보낼 수 있도록 `multiprocessing`의 Pool을 이용했습니다.

```python
import sys
import requests
from multiprocessing import Pool

def request_save_cash(url):
    requests.post(url, data={'userId': 'test', 'amount': '1'})

if __name__ == "__main__":
    concurrent_size = 5
    url = sys.argv[1]
    request_n = 1000

    with Pool(concurrent_size) as p:
        p.map(request_save_cash, [url for _ in range(request_n)])

    print("=====================")
    print('complete all requests')
    print("=====================")
```

## 테스트 시작

드디어 테스트 환경을 다 구성했습니다. 테스트를 진행해 보겠습니다.

### Lock 미처리 URL로 요청

Lock 처리가 되지 않은 `/async/cash`로 테스트 계정의 캐시를 1만큼 적립해 달라는 요청을 1,000번 전송하였습니다.

![](/assets/image/posts/2021-04-05-distributed-locking/0.png)

### 결과

![](/assets/image/posts/2021-04-05-distributed-locking/1.png)

1,000번 보냈는데, 329원만 적립 되었습니다. 여러 번 시도해도 379, 340처럼 1,000에 한참 못 미치는 값이 저장됩니다.

**당연하지만 결론은 실패로 볼 수 있습니다.**

### Lock 처리 URL로 요청

그렇다면 Redisson을 이용하여 Lock 처리한 URL로 요청을 보내 보겠습니다.

![](/assets/image/posts/2021-04-05-distributed-locking/2.png)

### 결과

![](/assets/image/posts/2021-04-05-distributed-locking/3.png)

정확히 1,000만큼 적립이 되어 있는 것을 확인할 수 있습니다. 성공적으로 동기화 로직이 실행되었다고 할 수 있겠습니다.  

**결론은 성공입니다.**

# 참고

https://dev.mysql.com/doc/refman/5.7/en/internal-locking.html

https://dev.mysql.com/doc/internals/en/user-level-locks.html

https://dev.mysql.com/doc/refman/5.7/en/locking-functions.html

[https://github.com/redisson/redisson/wiki/1.-Overview](https://github.com/redisson/redisson/wiki/1.-Overview)

[https://github.com/redisson/redisson/wiki/Table-of-Content](https://github.com/redisson/redisson/wiki/Table-of-Content)