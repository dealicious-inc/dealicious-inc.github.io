---
layout: page
title: GitHub Actions로 안드로이드 CI환경 구축하기 (Goodbye Jenkins)
writer: 정수천
thumbnail: 'posts/2020-12-30-actions-01.png'
---

## Intro

저는 딜리셔스 모바일 파트에서 안드로이드 개발을 담당하는 정수천입니다.

올해 초 모바일 파트의 repository(이하 repo)는 **Bitbucket**에서 **GitHub**로 이사를 갔습니다. 

GitHub repo에서 이것저것 구경하던 중 상단 탭에 떠있는 **Actions** 메뉴가 눈에 들어왔습니다.

![](/assets/image/posts/2020-12-30-actions-01.png)

공식 문서에서는 GitHub Actions를 이렇게 소개하고 있습니다.

> Automate, customize, and execute your software development workflows right in your repository with GitHub Actions. You can discover, create, and share actions to perform any job you'd like, including CI/CD, and combine actions in a completely customized workflow.

번역하자면, GitHub repo와 직접 연동해서 쓸 수 있는 CI/CD 도구입니다. 개발 후 배포 과정을 자동화, 커스텀, 실행하도록 도와줍니다.

간단히 설명하자면 **Build, Test, Deploy**가 가능한 서비스입니다.

오! 안드로이드 기본 빌드 스크립트도 제공하는군요. GitHub Actions를 어렵지 않게 시작할 수 있습니다. 😄

![](/assets/image/posts/2020-12-30-actions-02.png)

모바일 파트의 빌드 시스템은 **Jenkins**를 이용하고 있었기 때문에 처음에는 딱히 변경할 필요성을 느끼지 못했습니다. 안정적으로 돌아가는 빌드 시스템을 변경해서 시간을 빼앗기느니 다른 내부 작업(리팩토링, 신규 프로젝트 등등)에 더 신경을 써야 하는 시기였습니다.

하지만 GitHub repo에 들어갈 때마다 **Actions** 메뉴가 쓰이지 않고 있으면 계속 거슬릴 것이란 점과 나온 지 얼마 되지 않은 최신 기술(2019년 11월 출시)을 적용한다는 설렘, 마지막으로 일단 집을 옮겼으니 썩 친근하지 않았던 집사(*Jenkins*, 2011년 02월 출시)도 바꿔보자 하는 마음으로 기술을 검토하고 직접 적용해 보았습니다.

![](/assets/image/posts/2020-12-30-actions-03.png)

이 포스팅에는 **GitHub Actions**의 개략적인 소개와 구축 방법, 환경 변수를 이용해 키스토어 파일과 credential 정보를 안전하게 사용하는 방법, S3를 이용하여 APK 바이너리를 저장하고 공유하는 방법의 내용을 담고 있습니다. Unit Test, UI Test 등의 내용은 포함되어 있지 않습니다.

## GitHub Actions 개요

- 빌드 스크립트 파일 위치 : repo/.github/workflows/xxx.yml
- 빌드 스크립트 파일은 **YAML**(*.yml)을 사용합니다. (“야믈”이라고 읽습니다. [위키](https://en.wikipedia.org/wiki/YAML))안드로이드 개발하면서 접할 일은 거의 없지만 Spring Boot 프레임워크 쪽에서는 서버 설정할 때 주로 쓰이는 확장자입니다. 계층 구조로 configuration하는 방식이며, 전체 구조가 한눈에 들어옵니다.다만 space 하나로도 컴파일 에러가 난다는 점은 명심해야 합니다.
- 마켓 플레이스([공식페이지](https://github.com/marketplace?type=actions))
    - 현재 약 6,200개 이상의 플러그인 존재 (*참고로 젠킨스는 약 1,000개 )
    - 안드로이드 관련 플러그인 : 46개
- 비용 ([문서](https://docs.github.com/en/free-pro-team@latest/github/setting-up-and-managing-billing-and-payments-on-github/about-billing-for-github-actions))
    - public repo 무료
    - private repo : 2000분 빌드 시간 제공
- 빌드 가상머신 서버 ([서버 목록](https://github.com/actions/virtual-environments))
    - 가상머신은 무료로 제공해 주는 것을 써도 되고 직접 호스팅 할 수 있으며 유료입니다.(그렇게 비싸진 않습니다)
    - OS : Windows, Ubuntu, macOS 제공
    - 여러가지 소프트웨어들이 설치되어 있습니다. ([자세히](https://github.com/actions/virtual-environments/blob/main/images/linux/Ubuntu1804-README.md))
        - 언어 : Swift, Julia, Ruby, Node, Python 등등
        - PM : Gem, Homebrew, Npm 등등
        - TOOL : 7-Zip, CMake, Git, Docker, curl, zstd 등등
        - CLI TOOL : AWS CLI, Azure CLI, GitHub CLI 등등
        - JAVA JDK, Gradle, Meven, MySQL Server, MongoDB, .NET Core SDK, Ruby
        - 특히, 안드로이드 빌드에 필요한 SDK, Build-tools, NDK 가 설치되어 있습니다.
- 환경 변수 사용
    - Android 빌드시에 필요한 키정보(Keystore file, Keystore password, key alias, key password, store password)등을 repo에 저장하고 빌드시에 사용할 수 있음
- 보다 자세한 내용은 [공식문서](https://docs.github.com/en/free-pro-team@latest/actions)에서 확인하시면 됩니다

---

# **안드로이드 개발자(서버 레벨1 )의 Jenkins 경험기**

- Jenkins는 Web base 서비스라 서버가 1대 필요합니다.
    - 클라우드 서비스에서 서버 인스턴스를 생성합니다.
    - 각종 소프트웨어 설치를 합니다. ex) JDK, Android SDK, FTP, Tomcat 등등블로그에 설치방법은 넘쳐나지만 가끔 내용대로 진행이 안되는 경우가 있습니다.
    - 보안을 위해 여러 네트워크 규칙을 적용합니다.(포트포워딩, 리다이렉트, 방화벽)
- Jenkins를 설치하고 각종 설정을 진행합니다.
    - Jenkins 홈페이지에서 안드로이드 빌드를 위해 각종 플러그인(gradle, artifect 등등)을 설치합니다.
    - Jenkins 에 Android Build를 위한 환경 변수 설정을 합니다.
    - git repo의 crendential 정보를 Jenkins 설정에 입력합니다.
- 서버 환경과 Jenkins 설치하는데 5일 이상이 소요되었지만 오~ 이제 빌드가 잘됩니다! 아주 잘 돌아갑니다.
- 시간이 흘러 빌드가 실패됐습니다. 원인은 아래와 같습니다.
    - targetSdkVersion 이 올라가니 빌드서버의 Android SDK를 업데이트해줘야 합니다. 라이센스 동의도 받는군요.
    - gradle 버전이 업데이트되어서 Jenkins의 gradle버전을 올려줘야 합니다.
- 무슨 업데이트가 이리 많은지 Jenkins 관리화면에 가고 싶지 않습니다. 한번 업데이트했다가 먹통이 난적이 있어서 이제는 겁이 납니다.

## **GitHub Actions는 위의 과정이 필요없습니다.**

> 서버 운영 필요 X- 필요한 모든 설정은 빌드 스크립트 안으로!즉, 모든 빌드에 대한 정보는 프로젝트 내 1개의 파일에 담겨 있습니다.다른 곳에 존재하던 빌드 구성이 소스코드 안으로 들어가는 것은 큰 변화를 줍니다. 저는 Jenkins 서버를 구축하여 어떻게 돌아가고 구성하는지 알지만, 다른 동료들한테는 머나먼 얘기가 됩니다. 하지만 GitHub Actions를 쓰게 되면 관련 개발자들에게 빌드 구성의 주도권을 쥐게 하며, 전체의 그림을 볼 수 있습니다.

---

# **준비물**

자! 이제 GitHub Actions을 사용하기 전 준비물을 살펴보겠습니다.

1. MacOS 기준으로 작성하였습니다.
2. GitHub 계정 + repository : GitHub Actions이니 GitHub repo가 필요합니다.
3. SLACK
    1. 빌드 시작 혹은 종료 시 노티를 받는 것으로, 다른 플러그인도 이용 가능합니다. SLACK 이용이 어려우면 이메일 플러그인이 가장 손쉽게 사용 가능하겠습니다.
    2. SLACK WebHook 준비 : [https://api.slack.com/messaging/webhooks](https://api.slack.com/messaging/webhooks)
    3. SLACK WebHook Key 준비
4. AWS S3
    1. APK가 저장되는 곳
    2. S3는 devops에서 지원을 받았습니다.
    3. access key와 secret key를 준비합니다.
    4. S3 준비가 어려우면 [Artifect](https://docs.github.com/en/free-pro-team@latest/actions/guides/storing-workflow-data-as-artifacts) 플러그인, [SLACK 파일 업로드 플러그인](https://github.com/marketplace?type=actions&query=slack+upload)을 사용하여도 되고 [구글 드라이브](https://github.com/marketplace?type=actions&query=google+drive), [구글 클라우드,](https://github.com/marketplace?type=actions&query=google+cloud) [이메일](https://github.com/marketplace?type=actions&query=email) 등 다양하게 업로드를 할 수 있습니다.
    5. 브라우징 플러그인 설치 ([S3 JS Explorer](https://github.com/awslabs/aws-js-s3-explorer) )
        1. Web UI환경에서 S3를 탐색할 수 있습니다.

---

# **구축**

## 환경 변수 준비

1. **키스토어 환경 변수 준비**

APK를 빌드 하는데 사용하고 있는 debug, release 키스토어 파일과 인증정보를 준비합니다.테스트로 만든 프로젝트의 키스토어 정보는 아래와 같습니다.

```bash
KEYSTORE_PASSWORD=123456
KEY_ALIAS=key0
KEY_PASSWORD=123456
```

혹시 app/build.gradle에 환경 변수가 아닌 코드로 키스토어 정보가 입력되어 있으면 아래와 같이 환경 변수 등록해야 합니다.(MacOS 기준)

```bash
open -e ~/.bash_profile

입력..
export KEYSTORE_PASSWORD=123456
export KEY_ALIAS=key0
export KEY_PASSWORD=123456
저장..

source ~/.bash_profile

*안드로이드 스튜디오 리부팅 이후 환경 변수 적용됩니다.
```

app/build.gradle

```config
signingConfigs {
        debug {
            storeFile file("../debug.keystore")
        }
        release {
            storeFile file("../release.keystore")
            storePassword "$System.env.KEYSTORE_PASSWORD"
            keyAlias "$System.env.KEY_ALIAS"
            keyPassword "$System.env.KEY_PASSWORD"
        }
    }
```

- storeFile : 프로젝트 root 폴더에 있습니다. 보안을 위해 repo에 존재하지 않고 로컬에만 있습니다.

이제 GitHub repo에 환경 변수를 등록합니다.

Setting → 좌측 하단 Secret 메뉴 → New repository secret 클릭

위에 있는 키 정보를 하나씩 등록합니다.

입력된 정보는 GitHub Actions 빌드 시에 이용이 가능합니다.

![](/assets/image/posts/2020-12-30-actions-04.png)


2. **키스토어 파일 정보 환경 변수 등록**

키스토어 파일은 프로젝트 root에 존재합니다. 키스토어 파일은 repo에 존재하지 않고 local 맥북에만 존재합니다. GitHub repo에는 BASE64 인코딩을 하여 환경 변수로 등록합니다.

```bash
openssl base64 -in [keystore file path] -out [base64 file path]
```

```bash
cd /project_path
openssl base64 -in release.keystore -out temp.txt
```

생성된 temp.txt 파일을 열어 내용을 전체 복사하여 Secret에 등록합니다.

![](/assets/image/posts/2020-12-30-actions-05.png)

3. **Slack Webhook, AWS S3 키 값 등록**

![](/assets/image/posts/2020-12-30-actions-06.png)


## **빌드 스크립트 YAML(*yml) 파일 생성**

![](/assets/image/posts/2020-12-30-actions-07.png)

GitHub repo에서 만들 수 있지만 저는 Android Studio에서 직접 생성하겠습니다.

`dev.yml` : dev 브랜치 작업 시에 빌드하며 APK 생성은 하지 않습니다.

`release.yml` : release 브랜치 작업 시에 빌드하며 APK를 생성합니다.

포스팅에서는 release.yml 을 살펴보겠습니다. dev용 빌드는 release에서 일부 기능만 제외하면 됩니다.

```yml
name: Android CI Release Build
```

Workflow의 이름을 지정합니다. 이 이름은 Actions 탭에서 아래와 같이 보입니다.

![](/assets/image/posts/2020-12-30-actions-08.png)

```yml
on:
  push:
    branches:
      - release
      - hotfix/*
    tags:
      - 'buildR/**'
```

빌드를 유발하는 액션을 정의합니다.

repo의 `push` 액션이 발생할 때 트리거 됩니다. 그리고 3가지의 조건인 경우에 빌드가 트리거 됩니다.

- branch명이 release 혹은 hotfix/*로 시작하는 경우 빌드가 유발됩니다.
- buildR/**로 태그가 생성되는 경우
    - 예 : feature/MyFunction 브랜치의 2차수 내부 배포가 필요한 경우 buildR/feature/MyFunction/2 태그 생성하면 빌드가 유발됩니다.(이렇게 사용하는 것은 추후 S3에 저장될 경로와 파일명에 정보를 추가하기 위해서입니다.)

```yml
jobs:
  build:                                  
    runs-on: ubuntu-18.04
    env:
      KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
      KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
      KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
      
      S3_BUCKET_URL: "s3://prod-test-bucket"
      S3_URL: "https://xxxx.s3.ap-northeast-2.amazonaws.com"
      S3_BROWSING: "https://xxxx.s3.ap-northeast-2.amazonaws.com/index.html#"
      
      VERSION_NAME: 1.2.4
      VERSION_CODE: 29
```

- `ubuntu-18.04` : 빌드는 ubuntu 18.04 서버 버전에서 실행됩니다.
- `KEY_ALIAS`, `KEYSTORE_PASSWORD`, `KEY_PASSWORD`
    - 위에서 정의한 Secret 키를 환경 변수로 등록합니다.
    - yml 빌드 스크립트에서의 접근은 `${{ secrets.KEY_ALIAS }}` 와 같이 사용합니다.
    - 등록된 환경 변수는 빌드가 돌아가는 가상머신의 환경 변수로 설정되며 `app/build.gradle`에서도 사용됩니다.
- `S3_BUCKET_URL`, `S3_URL` , `S3_BROWSING` : 버킷 URL, S3 다운로드 링크에 사용될 URL, Brwosing(위에 [S3 JS Explorer](https://github.com/awslabs/aws-js-s3-explorer) 설치하면 사용 가능)에 사용될 URL 경로를 설정합니다.
- `VERSION_NAME`, `VERSION_CODE`
    - 버전 정보를 입력합니다.
    - 버전 정보는 yml 빌드 스크립트에서 APK 파일명을 만들 때 이용됩니다.
    - `app/build.gradle`에서는 APK 파일 버저닝 정보에 이용됩니다.
    
app/build.gradle
```java
//getVersionCode() 는 정의된 함수이니 사용하지 마세요!
static def getMyVersionName() {
    File file = new File(".github/workflows/release.yml")
    String result = ""
    for (String str : file.readLines()) {
        if (str.contains("VERSION_NAME")) {
            result = str.replace("      VERSION_NAME: ", "")           
            break
        }
    }
    return Integer.parseInt(result.trim())
}

static String getMyVersionCode() {
    File file = new File(".github/workflows/release.yml")
    String result = ""
    for (String str : file.readLines()) {
        if (str.contains("VERSION_CODE")) {
            result = str.replace("      VERSION_CODE: ", "")
            break
        }
    }
    return result.trim()
}

android {
    defaultConfig {
        versionCode getMyVersionCode() 
        versionName getMyVersionName()
    }
```

```yml
- name: Set Time Zone
  run: sudo ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime
```

- 나중에 APK 파일명에 시간 정보 기록을 위해 가상머신의 시간 기준을 서울로 변경합니다.

```yml
- name: Extract branch name
  shell: bash
  run: |
    export BRANCH_RAW=$(echo ${GITHUB_REF#refs/heads/})
    echo "BRANCH_RAW=$BRANCH_RAW" >> $GITHUB_ENV
    echo "BRANCH_RAW : $BRANCH_RAW"

    export BRANCH_PATH_FULL="$(echo $BRANCH_RAW | sed 's/refs\/tags\/buildR\///' | sed 's/\/$//')"
    echo "BRANCH_PATH_FULL=$BRANCH_PATH_FULL" >> $GITHUB_ENV
    echo "BRANCH_PATH_FULL : $BRANCH_PATH_FULL"

    export BRANCH_PATH_WITHOUT_NO_TAIL="$(echo $BRANCH_PATH_FULL | sed 's/\/[0-9]*$//')"
    echo "BRANCH_PATH_WITHOUT_NO_TAIL=$BRANCH_PATH_WITHOUT_NO_TAIL" >> $GITHUB_ENV
    echo "BRANCH_PATH_WITHOUT_NO_TAIL : $BRANCH_PATH_WITHOUT_NO_TAIL"

    export BRANCH_TAG_NO="$(echo $BRANCH_PATH_FULL | sed "s|$BRANCH_PATH_WITHOUT_NO_TAIL||g" | sed 's/\///')"
    echo "BRANCH_TAG_NO=$BRANCH_TAG_NO" >> $GITHUB_ENV
    echo "BRANCH_TAG_NO : $BRANCH_TAG_NO"

    if [ -z "${BRANCH_TAG_NO// }" ]
    then
      export BRANCH_PATH_FOR_FILENAME="$(echo $BRANCH_PATH_WITHOUT_NO_TAIL | sed 's/\//-/'  | sed 's/_/-/g')"
    else
      export BRANCH_PATH_FOR_FILENAME="$(echo $BRANCH_PATH_WITHOUT_NO_TAIL-$BRANCH_TAG_NO | sed 's/\//-/'  | sed 's/_/-/g')"
    fi
    echo "BRANCH_PATH_FOR_FILENAME=$BRANCH_PATH_FOR_FILENAME" >> $GITHUB_ENV
    echo "BRANCH_PATH_FOR_FILENAME : $BRANCH_PATH_FOR_FILENAME"
```

- 브랜치 이름을 추출하는 설정입니다. 나중에 파일의 경로와 APK 파일명에 들어갑니다.
    - `|`: `run` 뒤에 multi line으로 커멘드 입력 시 써줍니다.
    - 일반적인 브랜치 push인 경우에 큰 문제는 없고 저렇게 길게 코드를 작성하여 뽑아낼 필요는 없습니다. 이유는 아래에 tag생성에 언급됩니다. 다만 제가 `sed` 커멘드에 익숙하지 않아 더 길게 만들어졌을 수도 있습니다 😂
    - 직접 정의한 환경 변수들도 있지만 GitHub repo에서 제공하는 환경 변수들이 있습니다.
      `${GITHUB_REF#refs/heads/}` : 브랜치의 이름을 가져오는 환경 변수입니다.이 값을 찍어 보면 아래와 같습니다.
        - release branch : `release`
        - feature/MyFunction : `feature/MyFunction`
        - buildR/feature/MyFunctiontag/1 생성 : `refs/tags/buildR/feature/MyFunctiontag/1`
    - tag 생성 시에 브랜치명이 길어지는 문제가 있어서 `sed`를 사용하여 문자열을 추출합니다.
    - `export BRANCH_RAW=$(echo ${GITHUB_REF#refs/heads/})`
      환경 변수를 export합니다. export 한 환경 변수는 코드가 있는 step 내에서만 이용 가능합니다.
    - `echo "BRANCH_RAW=$BRANCH_RAW" >> $GITHUB_ENV`
      다음번 step에 사용하기 위해 GITHUB_ENV에 저장합니다. 이렇게 저장하면 이 다음 step 어디에서도 이용 가능하고 아래 명령어로 사용할 수 있습니다.${{ env.BRANCH_RAW }}
    - `echo "BRANCH_RAW : $BRANCH_RAW"`
      Actions 콘솔 로그 확인 용도로 찍어줍니다. 아래와 같이 확인이 가능합니다.
![](/assets/image/posts/2020-12-30-actions-09.png)
    - `sed`
        - `sed 's/refs\/tags\/buildR\///'`
          문자열에서 refs/tags/buildR/ 제거
        - `sed 's/\/$//'`
          제일 마지막 '/' 슬래쉬 제거
        - `sed 's/\/[0-9]*$//'`
          제일 마지막 '/숫자' 형식의 문자열 제거

```yml
- name: set APK name and S3 path
  run: |
    export TEMP_APK_VERSION_NAME="${GITHUB_REPOSITORY##*/}-${{ env.BRANCH_PATH_FOR_FILENAME }}-${{ env.VERSION_NAME }}-${{ env.VERSION_CODE }}"
    export TEMP_APK_NAME="$TEMP_APK_VERSION_NAME-$(date +'%Y-%m-%d-%H:%M:%S').apk"

    echo "APK_NAME=$TEMP_APK_NAME" >> $GITHUB_ENV
    echo "PATH_PREFIX=output/${GITHUB_REPOSITORY##*/}/${BRANCH_PATH_WITHOUT_NO_TAIL}" >> $GITHUB_ENV
```

- S3에 업로드할 APK 파일명과 경로를 지정해 줍니다.
    - 제가 원하는 파일명은 `repo명-브랜치명-태그버전-버전이름-버전코드-날짜.apk`입니다.
      제가 원하는 경로는 `S3 bucket root/output/repo명/` 입니다.
        - release
            - 파일명 : deali-mobile-android-ssm-release-3.7.22-79-20201126-18:35:00.apk
            - 경로 : output/deali-mobile-android-ssm/release/
        - feature/MyFunction
            - 파일명 : deali-mobile-android-ssm-feature-MyFunction-3.7.22-79-20201126-18:35:00.apk
            - 경로 : output/deali-mobile-android-ssm/feature/MyFunction/
        - buildR/feature/MyFunction/3 tag 생성
            - 파일명 : deali-mobile-android-ssm-feature-MyFunction-3-3.7.22-79-20201126-18:35:00.apk
            - 경로 : output/deali-mobile-android-ssm/feature/MyFunction/
        - S3에 업로드 이후에는 아래와 같이 APK가 저장됩니다.

![](/assets/image/posts/2020-12-30-actions-10.png)
![](/assets/image/posts/2020-12-30-actions-11.png)

```yml
- name: Slack Notification Start
  uses: rtCamp/action-slack-notify@v2
  if: always()
  env:
    SLACK_ICON_EMOJI: ":ssm:"
    SLACK_TITLE: ":android: 빌드 시작 / 버전 : ${{ env.VERSION_NAME }}(${{ env.VERSION_CODE }}) / 브랜치 : ${{ env.BRANCH_PATH_WITHOUT_NO_TAIL }}"
    SLACK_USERNAME: "ssm-mobile-builder-bot"
    SLACK_CHANNEL: "#github_actions_test"
    SLACK_COLOR: "#CCCCCC"
    SLACK_MESSAGE: "commit : ${{ github.event.head_commit.message }}"
    SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
```

- 빌드의 시작 알림을 SLACK으로 보냅니다.
- :ssm: SLACK의 이모지 입니다.
- 아래와 같이 SLACK으로 메시지가 옵니다. SLACK 플러그인은 굉장히 많으니 입맛에 맞는 걸로 사용하면 됩니다.

![](/assets/image/posts/2020-12-30-actions-12.png)

```yml
- name: Setup Android SDK
  uses: android-actions/setup-android@v2
```

안드로이드 SDK를 세팅합니다. 가상머신에 기본적으로 Android SDK가 설치되어 있지만 해당 작업은 $ANDROID_HOME 같은 환경 변수 설정도 진행해 줍니다.

```yml
- name: Install NDK
  run: echo "y" | sudo /usr/local/lib/android/sdk/tools/bin/sdkmanager --install "ndk;20.0.5594570" --sdk_root=${ANDROID_SDK_ROOT}
```

기본적으로 NDK도 설치되어 있지만 특수 버전의 설치가 필요하면 위의 코드를 사용하면 됩니다.

다른 라이브러리를 이용하여 NDK설정을 할 수 있지만 직접 커멘드로 다운 받는 것이 가장 빠릅니다.

```yml
- name: Create Release KeyStore File
  run: echo "${{ secrets.KEY_BASE_64_RELEASE }}" | base64 -d > release.keystore
```

- 위에서 만든 키스토어 Secret 키 KEY_BASE_64_RELEASE값을 디코딩 하여 release.keystore 가상머신의 프로젝트 root 위치에 파일을 생성합니다.

```yml
- name: Make gradlew executable
  run: chmod +x ./gradlew
```

- 가상머신에서 `./gradlew` 파일의 권한을 사용할 수 있도록 변경해 줍니다.

```yml
- name: Build with Gradle
  run:
    ./gradlew clean assembleRelease
```

- 이제 정말 빌드를 시작합니다.

```yml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v1
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ap-northeast-2
```

AWS S3를 사용하기 위해 credential 정보를 입력합니다.

```yml
- name: Copy files to S3 with the AWS CLI
  run: |
    find . -type f -name "*.apk" -exec cp '{}' ${{ env.APK_NAME }} \;
    aws s3 cp ${{ env.APK_NAME }} ${{ env.S3_BUCKET_URL }}/${{ env.PATH_PREFIX }}/
```

위에서 정의한 경로와 파일명을 이용하여 S3에 업로드합니다.

```yml
- name: Slack Notification Finish With Success
  uses: rtCamp/action-slack-notify@v2
  if: success()
  env:
    SLACK_ICON_EMOJI: ":android:"
    SLACK_TITLE: ":android2: 빌드 성공 / 버전 : ${{ env.VERSION_NAME }}(${{ env.VERSION_CODE }}) / 브랜치 : ${{ env.BRANCH_PATH_WITHOUT_NO_TAIL }}"
    SLACK_USERNAME: "ssm-mobile-builder-bot"
    SLACK_CHANNEL: "#github_actions_test"
    SLACK_COLOR: "#00BFA5"
    SLACK_MESSAGE: "commit : ${{ github.event.head_commit.message }}\n<${{ env.S3_URL }}/${{ env.PATH_PREFIX }}/${{ env.APK_NAME }}|파일다운로드>, <${{ env.S3_BROWSING }}${{ env.PATH_PREFIX }}/|브라우징>"
    SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}

- name: Slack Notification Finish With Fail
  uses: rtCamp/action-slack-notify@v2
  if: failure()
  env:
    SLACK_ICON_EMOJI: ":android:"
    SLACK_TITLE: ":android2: 빌드 실패 / 버전 : ${{ env.VERSION_NAME }}(${{ env.VERSION_CODE }}) / 브랜치 : ${{ env.BRANCH_PATH_WITHOUT_NO_TAIL }}"
    SLACK_USERNAME: "ssm-mobile-builder-bot"
    SLACK_CHANNEL: "#github_actions_test"
    SLACK_COLOR: "#FF5252"
    SLACK_MESSAGE: "commit : ${{ github.event.head_commit.message }}"
    SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
```

마지막으로 SLACK으로 성공 혹은 실패에 따라 메시지를 보냅니다.

![](/assets/image/posts/2020-12-30-actions-13.png)
![](/assets/image/posts/2020-12-30-actions-14.png)

Actions URL을 방문하면 아래와 같이 확인이 가능합니다.

- STEP 별 소요 시간 및 로그 확인 가능
![](/assets/image/posts/2020-12-30-actions-15.png)

- 빌드 스크립트 전체

release.yml
```yml
name: Android CI Release Build

on:
  push:
    branches:
      - release
      - hotfix/*
    tags:
      - 'buildR/**'

jobs:
  build:
    runs-on: ubuntu-18.04
    env:
      KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
      KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
      KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
      VERSION_NAME: 1.2.4
      VERSION_CODE: 29

      S3_BUCKET_URL: "s3://prod-test-bucket"
      S3_URL: "https://xxxx.s3.ap-northeast-2.amazonaws.com"
      S3_BROWSING: "https://xxxx.s3.ap-northeast-2.amazonaws.com/index.html#"

    steps:
      - name: Set Time Zone
        run: sudo ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime

      - name: Extract branch name
        shell: bash
        run: |
          export BRANCH_RAW=$(echo ${GITHUB_REF#refs/heads/})
          echo "BRANCH_RAW=$BRANCH_RAW" >> $GITHUB_ENV
          echo "BRANCH_RAW : $BRANCH_RAW"

          export BRANCH_PATH_FULL="$(echo $BRANCH_RAW | sed 's/refs\/tags\/buildR\///' | sed 's/\/$//')"
          echo "BRANCH_PATH_FULL=$BRANCH_PATH_FULL" >> $GITHUB_ENV
          echo "BRANCH_PATH_FULL : $BRANCH_PATH_FULL"

          export BRANCH_PATH_WITHOUT_NO_TAIL="$(echo $BRANCH_PATH_FULL | sed 's/\/[0-9]*$//')"
          echo "BRANCH_PATH_WITHOUT_NO_TAIL=$BRANCH_PATH_WITHOUT_NO_TAIL" >> $GITHUB_ENV
          echo "BRANCH_PATH_WITHOUT_NO_TAIL : $BRANCH_PATH_WITHOUT_NO_TAIL"

          export BRANCH_TAG_NO="$(echo $BRANCH_PATH_FULL | sed "s|$BRANCH_PATH_WITHOUT_NO_TAIL||g" | sed 's/\///')"
          echo "BRANCH_TAG_NO=$BRANCH_TAG_NO" >> $GITHUB_ENV
          echo "BRANCH_TAG_NO : $BRANCH_TAG_NO"

          if [ -z "${BRANCH_TAG_NO// }" ]
          then
            export BRANCH_PATH_FOR_FILENAME="$(echo $BRANCH_PATH_WITHOUT_NO_TAIL | sed 's/\//-/'  | sed 's/_/-/g')"
          else
            export BRANCH_PATH_FOR_FILENAME="$(echo $BRANCH_PATH_WITHOUT_NO_TAIL-$BRANCH_TAG_NO | sed 's/\//-/'  | sed 's/_/-/g')"
          fi
          echo "BRANCH_PATH_FOR_FILENAME=$BRANCH_PATH_FOR_FILENAME" >> $GITHUB_ENV
          echo "BRANCH_PATH_FOR_FILENAME : $BRANCH_PATH_FOR_FILENAME"

      - name: set APK name and S3 path
        run: |
          export TEMP_APK_VERSION_NAME="${GITHUB_REPOSITORY##*/}-${{ env.BRANCH_PATH_FOR_FILENAME }}-${{ env.VERSION_NAME }}-${{ env.VERSION_CODE }}"
          export TEMP_APK_NAME="$TEMP_APK_VERSION_NAME-$(date +'%Y-%m-%d-%H:%M:%S').apk"

          echo "APK_NAME=$TEMP_APK_NAME" >> $GITHUB_ENV
          echo "PATH_PREFIX=output/${GITHUB_REPOSITORY##*/}/${BRANCH_PATH_WITHOUT_NO_TAIL}" >> $GITHUB_ENV

      - uses: actions/checkout@v2

      - name: Slack Notification Start
        uses: rtCamp/action-slack-notify@v2
        if: always()
        env:
          SLACK_ICON_EMOJI: ":ssm:"
          SLACK_TITLE: ":android2: 빌드 시작 / 버전 : ${{ env.VERSION_NAME }}(${{ env.VERSION_CODE }}) / 브랜치 : ${{ env.BRANCH_PATH_WITHOUT_NO_TAIL }}"
          SLACK_USERNAME: "ssm-mobile-builder-bot"
          SLACK_CHANNEL: "#github_actions_test"
          SLACK_COLOR: "#CCCCCC"
          SLACK_MESSAGE: "commit : ${{ github.event.head_commit.message }}"
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}

      - name: Store Gradle cache
        uses: actions/cache@v2
        with:
          path: ~/.gradle/caches
          key: ${{ runner.os }}-gradle-${{ hashFiles('**/*.gradle*') }}
          restore-keys: ${{ runner.os }}-gradle-

      - name: Setup Android SDK
        uses: android-actions/setup-android@v2

      - name: Install NDK
        run: echo "y" | sudo /usr/local/lib/android/sdk/tools/bin/sdkmanager --install "ndk;20.0.5594570" --sdk_root=${ANDROID_SDK_ROOT}

      - name: Create Release KeyStore File
        run: echo "${{ secrets.KEY_BASE_64_RELEASE }}" | base64 -d > release.keystore

      - name: Make gradlew executable
        run: chmod +x ./gradlew
      - name: Build with Gradle
        run:
          ./gradlew clean assembleRelease

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2

      - name: Copy files to S3 with the AWS CLI
        run: |
          find . -type f -name "*.apk" -exec cp '{}' ${{ env.APK_NAME }} \;
          aws s3 cp ${{ env.APK_NAME }} ${{ env.S3_BUCKET_URL }}/${{ env.PATH_PREFIX }}/

      - name: Slack Notification Finish With Success
        uses: rtCamp/action-slack-notify@v2
        if: success()
        env:
          SLACK_ICON_EMOJI: ":android2:"
          SLACK_TITLE: ":android2: 빌드 성공 / 버전 : ${{ env.VERSION_NAME }}(${{ env.VERSION_CODE }}) / 브랜치 : ${{ env.BRANCH_PATH_WITHOUT_NO_TAIL }}"
          SLACK_USERNAME: "ssm-mobile-builder-bot"
          SLACK_CHANNEL: "#github_actions_test"
          SLACK_COLOR: "#00BFA5"
          SLACK_MESSAGE: "commit : ${{ github.event.head_commit.message }}\n<${{ env.S3_URL }}/${{ env.PATH_PREFIX }}/${{ env.APK_NAME }}|파일다운로드>, <${{ env.S3_BROWSING }}${{ env.PATH_PREFIX }}/|브라우징>"
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}

      - name: Slack Notification Finish With Fail
        uses: rtCamp/action-slack-notify@v2
        if: failure()
        env:
          SLACK_ICON_EMOJI: ":android2:"
          SLACK_TITLE: ":android2: 빌드 실패 / 버전 : ${{ env.VERSION_NAME }}(${{ env.VERSION_CODE }}) / 브랜치 : ${{ env.BRANCH_PATH_WITHOUT_NO_TAIL }}"
          SLACK_USERNAME: "ssm-mobile-builder-bot"
          SLACK_CHANNEL: "#github_actions_test"
          SLACK_COLOR: "#FF5252"
          SLACK_MESSAGE: "commit : ${{ github.event.head_commit.message }}"
          SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}

```

app/build.gradle
```yml
plugins {
    id 'com.android.application'
    id 'kotlin-android'
}

static def getMyVersionName() {
    File file = new File(".github/workflows/release.yml")
    String result = ""
    for (String str : file.readLines()) {
        if (str.contains("VERSION_NAME")) {
            result = str.replace("      VERSION_NAME: ", "")
            break
        }
    }
    return result.trim()
}

static String getMyVersionCode() {
    File file = new File(".github/workflows/release.yml")
    String result = ""
    for (String str : file.readLines()) {
        if (str.contains("VERSION_CODE")) {
            result = str.replace("      VERSION_CODE: ", "")
            break
        }
    }
    return result.trim()
}

android {
    compileSdkVersion 29
    buildToolsVersion "30.0.0"

    defaultConfig {
        applicationId "com.example.githubactionstest"
        minSdkVersion 29
        targetSdkVersion 29
        versionCode Integer.parseInt(getMyVersionCode())
        versionName getMyVersionName()

        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        debug {
            storeFile file("../debug.keystore")
        }
        release {
            storeFile file("../release.keystore")
            storePassword "$System.env.KEYSTORE_PASSWORD"
            keyAlias "$System.env.KEY_ALIAS"
            keyPassword "$System.env.KEY_PASSWORD"
        }
    }

    buildTypes {
        debug {
            minifyEnabled false
            signingConfig signingConfigs.debug
        }
        release {
            minifyEnabled true
            signingConfig signingConfigs.release
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = '1.8'
    }

    buildFeatures {
        viewBinding true
    }
}

dependencies {

    implementation "org.jetbrains.kotlin:kotlin-stdlib:1.4.10"
    implementation 'androidx.core:core-ktx:1.3.2'
    implementation 'androidx.appcompat:appcompat:1.2.0'
    implementation 'com.google.android.material:material:1.2.1'
    implementation 'androidx.constraintlayout:constraintlayout:2.0.4'
    testImplementation 'junit:junit:4.13.1'
    androidTestImplementation 'androidx.test.ext:junit:1.1.2'
    androidTestImplementation 'androidx.test.espresso:espresso-core:3.3.0'
}
```

# 마치며

GitHub Actions를 적용하기까지 꽤 많은 우여곡절이 있었습니다. 하나의 기능 컨셉을 확인하기 위해 하루에 50, 60번 커밋 한 적도 있었습니다. 게다가 빌드 시간도 오래 걸려서 기다리기 힘들었습니다.

![](/assets/image/posts/2020-12-30-actions-16.png)

많은 시행착오 끝에 딜리셔스 모바일 파트의 요구 사항에 맞는 빌드 스크립트가 완성되었고, 지금은 저와 동료들 모두 만족하며 사용하고 있습니다. 무엇보다도 빌드 서버를 관리하지 않게 되어 행복합니다.

이 포스팅을 보고 GitHub Actions를 좀 더 수월하게 적용하는데 작게나마 도움이 되었으면 합니다. 긴 글 읽어주셔서 감사합니다.

> Jenkins를 계속 사용하겠다면 밑의 이미지를 보고 다시 생각해보세요. 😂

![](/assets/image/posts/2020-12-30-actions-17.png)
