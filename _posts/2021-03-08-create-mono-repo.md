---    
layout: page    
title:  "Private npm registry 도입기"    
writer: 이다빈    
description: "lerna + vue + typescirpt 공통 모듈 패키지 배포하기"
tags: [Github, mono-repo, Lerna, Architecture]
thumbnail: '/posts/20210308dabin/2021-03-08-09.png'    
---

# lerna + vue + typescirpt 공통 모듈 패키지 배포하기
# 도입배경

딜리셔스 웹파트에서 관리하는 여러 프로젝트는 대부분 Vue.js를 도입하여 컴포넌트 기반으로 구성되어 있습니다.

각각의 프로젝트 안에는 비즈니스 로직이 포함된 개별 컴포넌트도 존재하지만 기본적인 컴포넌트는 동일한 경우가 많습니다. 
예를 들어 신상마켓 소매 사용자 웹사이트와 도매 판매자 웹사이트의 로그인 화면을 살펴봅시다.

![신상마켓 소매사용자 웹](/assets/image/posts/20210308dabin/2021-03-08-01.png)

![신상마켓 도매판매자 웹](/assets/image/posts/20210308dabin/2021-03-08-02.png)

신상마켓 소매 사용자 웹사이트와 도매 판매자 웹사이트는 별도의 프로젝트로 진행되었고 각각 하나의 Github Repository 를 가지고 있지만
UI, 기능이 같은 다수의 공통 컴포넌트가 존재합니다. 위 화면에서는 TextInput, Button, Check Box 가 그에 해당합니다.
문제는 별도 Github Repository 마다 공통 컴포넌트가 존재하면 신규 프로젝트가 진행될 때 마다 중복 코드가 늘어난다는 점이었습니다.

그래서 공통 컴포넌트들을 한곳에서 관리하고 배포할 수 있도록 사설 저장소와 Mono-Repo 를 도입하게 되었습니다.

# GitHub Packages

프로젝트가 오픈 소스 라이브러리라면 누구나 접근할 수 있어야 하지만,
회사에서 개발하는 서비스라면 사내 개발팀만 접근할 수 있어야 합니다.

즉, Private 한 접근 권한을 가진 저장소가 필요했는데요.
웹 파트에서는 이미 프로젝트 저장소로 Github 를 사용하고 있었고
비용적인 측면과 관리 포인트 최소화의 이유로 Github 에서 제공하는 GitHub Packages 를 사용하기로 하였습니다.
다른 옵션으로는 NPM pro 계정을 사용하거나 Verdaccio 를 사용하여 직접 사설 저장소를 운영할 수 있습니다.

GitHub Packages 는 NPM 뿐만 아니라 Docker, RubyGems, Maven, NuGet 등 
대부분의 언어의 패키지 서비스를 제공합니다. (당연히 공개 저장소도 제공합니다.)

## 어떻게 써야 할까

사설 저장소를 활용하여 배포하기 위해서는 기존 NPM 공개 저장소에 배포하는 방법과 다르게 몇 가지 추가 설정이 필요합니다.

### 액세스 토큰 발급

먼저, 사설 Github Packages 를 사용하기 위한 액세스 토큰이 필요합니다. 

액세스 토큰은 패키지를 배포(`$npm publish`) 하거나 다운로드(`$npm install`) 할 때 사용합니다.
Github 에 로그인 한 뒤 Settings -> Developer settings -> Personal access tokens -> Generate new token 메뉴에 들어갑니다.
Note 란에 토큰 사용처나 발급목적을 적어두어 다른 토큰과 혼동되지 않게 해줍니다.

![Access_token_setting](/assets/image/posts/20210308dabin/2021-03-08-03.png)

repo, write:packages, read:packages 권한에 체크하고 토큰을 생성합니다.
**이 때 페이지를 벗어나면 발급된 토큰을 다시 확인할 수 없으니** 잊어버리지 않도록 따로 저장해두어야 합니다.


### Github Packages 에 배포하기

Github Packages 에 패키지를 배포하기 위해서는 Github Repository 가 필요합니다.

1. **소스 코드 배포를 위한 Repository 를 생성합니다.**

2. **package.json 설정**

package.json

```json
{
  "name": "@deali-web/helloWorld",
  "version": "1.0.8",
  "description": "package example",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "dabin",
  "license": "ISC",
  "keywords": [
    "console"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/deali-web/helloWorld"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

npm 배포를 위해 설정한 package.json 파일 내용 예시입니다.
(배포에 필요하지 않은 부분은 생략했습니다.)

```json
{
  "name": "@deali-web/helloWorld"
}
```

name:  Github 저장소 Owner 명을 접두어로 붙여줍니다. → @deali-web/{패키지명}

이 이름이 추후 install 시 사용할 패키지 이름이 됩니다.

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/deali-web/helloWorld"
  }
}
```

repository.type은 "git"으로 하고 repository.url 에 Github 저장소 주소를 입력합니다. 
위 주소가 패키지의 URL이 됩니다.

```json
{
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

npm 저장소의 기본 주소가 [https://registry.npmjs.org](https://registry.npmjs.org/) 로 설정되어 있기 때문에
별도의 주소 설정을 하지 않으면 www.npmjs.com으로 패키지가 배포되게 됩니다.
publishConfig·registry에 GithubPackages npm 주소인 "https://npm.pkg.github.com"을 써줍니다. 

3. **.npmrc 설정**

프로젝트 단위로 .npmrc 설정을 하는 경우, 프로젝트 root 디렉터리에. npmrc 파일을 생성합니다.

.npmrc

```bash
//npm.pkg.github.com/:_authToken={Github설정에서 생성한 Personal Access Token}
@deali-web:registry=https://npm.pkg.github.com/
```

로컬 npm 설정을 하는 경우, ~/.npmrc 파일 내용을 위와 같게 수정해 줍니다.

4. **패키지 배포**

```bash
$ npm version patch
```

현재 패키지 배포되어있는 버전과 같거나 낮은 버전으로는 배포가 불가능하기 때문에,
배포 전에는 위 명령어를 실행하여 패키지 버전을 올려주어야 합니다.

```bash
$ npm publish
```

명령어를 실행하면 배포가 시작됩니다.
배포에 성공하면 해당 프로젝트 주소의 Packages 메뉴에서 배포된 패키지를 확인할 수 있습니다.

![Repository_Packages](/assets/image/posts/20210308dabin/2021-03-08-04.png)

이제 Github Packages 사설 저장소 설정이 완료되었습니다.

하지만 단순히 사설 NPM 저장소를 사용하는 것만으로는 실제 프로젝트에 적용하기에 부족한 점이 많습니다.

웹파트에서 관리하는 프로젝트는 Vue.js 를 typescript 와 함꼐 사용하고 있어서 배포 전 빌드 과정이 꼭 필요합니다.
또한 하나의 라이브러리를 하나의 패키지로 배포하게 되면
패키지 간 공통 모듈에 대해서는 또다시 중복 코드가 발생하게 되고 유지 보수 복잡도가 증가하게 됩니다.

해결책은 하나의 Repository 에서 여러 개의 package.json 파일을 관리할 수 있는 Mono-Repo 를 사용하는 것입니다.
이렇게 하면 하나의 Repository 로 여러 개의 패키지를 배포할 수 있고 패키지 간 중복 코드를 제거할 수 있습니다.

# Mono-Repo 란?

 기본적으로 `$npm init`을 통해 생성한 node_module 기반 프로젝트는 package.json 파일을 가진 단일 패키지로 구성됩니다. 
 Mono-Repo 는 하나의 프로젝트로 여러 패키지를 관리하는 개념을 말합니다.

### 장점

- 공통코드 사용 용이 (비즈니스 로직 공유, 패키지간 참조 가능)
- 패키지 간 node_module 공통 사용 (eslint, unit test 등 설정 공유)
- 1개 저장소 관리로 인해 유지보수 용이성 증가

### 단점

- 단일 저장소 사이즈가 매우 커질 수 있음
- 여러 패키지가 무분별하게 서로 의존성을 가지가 될 수 있음

위 장단점을 토대로 Mono-Repo 는 공통 관심사를 가진 패키지들끼리 묶어서 사용할 때 가장 효율적이라는 것을 알 수 있습니다.
웹파트에서는 Mono-repo 를 구성하고 관리할 수 있는 도구로 Lerna 를 사용했습니다.

# Lerna

![Lerna](/assets/image/posts/20210308dabin/2021-03-08-05.png)

Lerna 는 배포 및 패키지 관리를 편하게 할 수 있는 CLI 를 제공해줍니다.

> 공식문서 : [https://lerna.js.org/](https://lerna.js.org/)
>
> github : [lerna/lerna](https://github.com/lerna/lerna)

웹파트에서는 공통 컴포넌트 모듈(Components)과 공통 함수 모듈(Composible)로 관심사를 구분하여 패키지를 구성하였습니다.


## Mono-Repo 프로젝트 생성하기

먼저 프로젝트 디렉터리를 생성한 뒤 npx 를 통해 `lerna` 명령어를 입력합니다.

```bash
$ npx lerna init --independent
```

이 때 independent 모드로 설정하면 패키지마다 별도의 버전으로 배포할 수 있습니다.
이렇게 Lerna 프로젝트를 초기화하면

```bash
lerna-ropo/
	packages/
	packages.json
	lerna.json
```

위 구조로 스캐폴딩 됩니다.

pacakge.json   → 루트의 package.json 파일에 Mono-Repo 에서 공통으로 사용할 의존성 설정이 가능합니다.

/lerna.json         → Lerna 설정 파일입니다.

/pacakges/        → packages 디렉터리 하위에 단일 패키지 프로젝트를 생성하게 됩니다. 

pacakges 경로를 임의의 폴더로 변경하고 싶다면 lerna.json 파일 에서 packages 옵션에 경로를 수정하면 됩니다.

## Vue 공통 컴포넌트 모듈 패키지 생성

```bash
$ lerna create components
```

components 라는 이름으로 packages 디렉터리 아래 생성됩니다.

Vue.js 패키지는 vue-cli를 사용하면 간단한 설정으로 Vue 라이브러리를 빌드 할 수 있습니다.

![Component_Directory_Architecture](/assets/image/posts/20210308dabin/2021-03-08-06.png)

먼저 packages 디렉터리 하위에 component 디렉터리를 만들고
Vue 라이브러리 설정을 위해 packages/components/package.json 파일을 수정해 줍니다.

```json
{
  "name": "@deali-web/components",
  "version": "0.1.2",
  "repository": {
    "type": "git",
    "url": "https://github.com/deali-web/vue-components"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  },
  "files": [
    "dist/*"
  ],
  "main": "dist/index.umd.min.js",
  "scripts": {
    "build": "vue-cli-service build --target lib --name index ./src/index.ts"
  },
  "dependencies": {
    "@vue/composition-api": "^1.0.0-rc.2",
    "vue": "^2.6.12"
  },
  "devDependencies": {
    "@vue/cli-plugin-typescript": "^4.5.11",
    "@vue/cli-service": "^4.5.11"
  }
}
```

사설 Github 저장소 배포 설정과 vue cli service 빌드 설정이 완료되었습니다.
그런 다음 packages/components/vue.config.js 파일을 수정합니다.

```jsx
module.exports = {
    runtimeCompiler: true,
    configureWebpack: {
        externals: {
            '@vue/composition-api': '@vue/composition-api',
            vue: 'vue',
        },
        entry: [
            '@babel/polyfill',
            './index.ts',
        ],
    },
    css: {
        extract: false,
        sourceMap: true,
        loaderOptions: {
            scss: {
                prependData: '@import "styles/main.scss";',
            },
        },
    },
};
```

`css.extract : false` 로 설정하면 라이브러리를 빌드했을 때 별도의 css 파일이 생기지 않고 컴포넌트에 스타일이 포함됩니다.

## 공통 함수 모듈 패키지 생성

```jsx
$ lerna create composible
```

composible 이라는 이름으로 packages 디렉터리 아래 생성됩니다.

![Composible_Directory_Architecture](/assets/image/posts/20210308dabin/2021-03-08-07.png)

composible 디렉토리의 공통함수 모듈은 타입스크립트로 작성하였기 때문에 tsc 빌드 과정이 필요합니다.
먼저 packages/composible/package.json 파일을 수정합니다.

```json
{ 
  "scripts": {
    "build": "tsc -b ./tsconfig.json"
  }
}
```

그런 다음 packages/composible/tsconfig.json 파일을 아래와 같이 작성합니다.

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "composite": true,
    "module": "commonjs",
    "esModuleInterop": true,
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

Lerna 루트에 기본 tsconfig.json 파일을 생성하였기 때문에 `extends`로 기본 설정을 확장해서 사용합니다.
이렇게 하면 프로젝트마다 개별적으로 필요한 설정만 추가해주면 됩니다.

## 패키지 배포 준비

이제 패키지 설정이 끝났습니다.
Lerna 프로젝트의 배포 준비는 아래와 같은 순서로 이루어집니다.

```bash
$ lerna bootstrap
```

`bootstrap` 명령어를 실행하면 packages/ 하위 패키지 각각의 `npm install` 명령어 실행과 더불어 
공통 사용 모듈(devDependencies)들을 루트 디렉터리의 package.json 로 추출합니다.

```bash
$ lerna run build
```

`lerna run [script]` 명령어는 packages/ 하위 패키지 각각의 `npm script` 명령어를 실행합니다.
여기서 위에 만들어둔 components 패키지와 composible 패키지의 빌드 명령어가 실행됩니다.

## 패키지 배포

Lerna 는 Git 기반으로 패키지의 변경사항을 체크합니다.
패키지를 배포하기 위해서 먼저 `git commit` 으로 변경사항을 저장해야 합니다.
independent 모드로 설정했기 때문에 변경이 있는 패키지만 독립적 배포가 가능합니다.

```bash
$ lerna publish
```

배포할 패키지가 존재한다면 대화형 CUI 가 실행됩니다.

![Lerna_CUI](/assets/image/posts/20210308dabin/2021-03-08-08.png)

CUI 에서 배포할 버전을 선택하면 배포가 시작됩니다.

배포된 패키지들은 자동으로 [패키지명]@[버전]으로 git 태그가 추가됩니다.

![Complete_Publish](/assets/image/posts/20210308dabin/2021-03-08-09.png)

배포가 잘 되었다면 Github Packages 에서 확인할 수 있습니다.

## 패키지 사용하기

우리가 만든 저장소는 사설 저장소이기 때문에 패키지를 사용하는 쪽에서도 .npmrc 설정이 필요합니다.

package.json

```json
{
  "dependencies": {
    "@deali-web/components": "0.1.2",
    "@deali-web/composible": "0.1.1"
  }
}
```

이제 기존 공개 라이브러리 사용하듯 편하게 사용할 수 있게 되었습니다.

# 마무리

신규 프로젝트를 진행할 때마다 컴포넌트의 양은 많아지고 복잡성이 증가하며 그에 따른 유지 보수 비용도 늘어나게 됩니다.
모노레포와 사설 저장소를 활용하여 중복 코드를 줄이고 한 곳에서 컴포넌트를 관리하는 것은
개발 환경 개선에 큰 도움이 된다고 생각합니다.

물론, 모노레포와 사설 저장소를 도입한 것 만으로 환경을 완벽하게 개선한 것은 아닙니다.

딜리셔스 웹파트에서는 추가로 프론트엔드 UI Component 개발을 더욱더 편하게 해주는 도구인
Storybook 과 테스트 코드를 더하여 더욱 나은 프로젝트 개발 환경을 만들기 위해 노력을 아끼지 않을 것입니다.