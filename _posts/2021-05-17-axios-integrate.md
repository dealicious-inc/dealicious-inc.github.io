---
layout: page
title:  "Axios 통신 한줄기로 만들기"
writer: 강전혁
description: "로그인 프로세스 개선"
tags: [frontend, Java Script, Axios, Session]
thumbnail: 'posts/2020-12-30-axios-integration-01.png'
---

>안녕하세요. 웹 파트의 강전혁입니다.
>이 글에서는 신규 서비스를 개발하면서 겪었던 경험을 공유하려고 합니다.

# 배경
딜리셔스에서 운영 중인 '신상마켓'은 동대문 패션 도매 시장과 국내, 해외 소매 사업자를 연결하는 O2O 서비스입니다. 서비스 특성상 상품의 도매가격을 확인할 수 있기 때문에 여러 사용자가 한 개의 아이디를 공유해서 사용하고 가격 정보를 노출하는 형태의 어뷰징 사례가 발생했습니다. 이러한 문제점을 해결하고자 백엔드 파트는 오랜 시간에 걸쳐 로그인 프로세스뿐만 아니라 대부분의 API를 개편했습니다.

저희 프론트엔드 팀도 개편 시기에 발맞춰 도매, 소매 웹 리뉴얼 작업에 들어갔으며 기존 PHP 환경을 모두 버리고 Vue.js를 이용한 새로운 환경을 구축했습니다.

# 로그인 프로세스 개선
기존 로그인 프로세스는 아무런 의미 없는 문자 조합을 이용한 암호화하는 방식 + 패스워드를 변경하지 않으면 영원히 변하지 않는 토큰을 이용하는 방식이었다면, 개편된 로그인 프로세스는 로그인할 때마다 토큰(access-token)이 변하고 그 자체에 expire 개념이 들어간 방식으로써 어떤 유저의 토큰이 노출되어도 단시간 내에 만료되게끔 설계되었습니다.

토큰에 expire 개념이 들어가 있다 보니 유저가 사용하다가 토큰 만료시간이 지나면 오류가 발생합니다. 그래서 새로운 토큰을 발급받을 수 있는 refresh-token를 만들고, 이 토큰을 이용하여 새로운 access-token을 받아 사용자가 서비스를 끊김 없이 이용할 수 있도록 구현했습니다.

![](/assets/image/posts/2020-12-30-axios-integration-01.png)<br/>
### case: 사용자가 발급받은 acess-token이 있다.
1. access-token이 정상인지 서버 측에서 검증 후 response를 준다.  
2. access-token이 정상이 아니라면(변조, 다른 PC에서 로그인 등) response에 특정 코드를 내려준다.

### case: 사용자가 발급받은 access-token이 만료되었다.
1. refresh-token이 없다면 로그인 페이지로 보내서 다시 로그인할 수 있도록 유도한다.  
2. refresh-token이 있다면 새로운 access-token을 얻는 API를 이용해서 받아온 후 인증한다.

# 뭐가 문제인데?
새로운 광고 서비스 개발 중 한 개의 API를 동시에 여러 번 호출해서 오류가 발생한다고 백엔드 팀에서 이슈를 전달해 주셨습니다. 원인은 access-token이 만료된 유저가 새로고침 또는 페이지 이동할 경우, 해당 페이지에서 호출하는 API의 개수만큼 session API 역시 호출하기 때문이었습니다. 이런 이슈는 API 개편 전에도 있어왔고, 프로젝트 리뉴얼 당시에는 저렇게라도 통신이 실패하지 않고 성공적으로, 그리고 사용자가 끊기는 것을 모르게 만드는 것이 최선이라고 생각했던 상황이었습니다.

refresh-token만 있고, 새로고침 했을 때의 상황입니다.<br/>
![](/assets/image/posts/2020-12-30-axios-integration-03.png)<br/>
페이지 접근 시 group, product, creative, point API를 각각의 컴포넌트에서 호출합니다. access-token이 없기 때문에 새로운 토큰을 발급받는 session API를 axios intercept로 먼저 호출하는 것을 볼 수 있습니다. 그 후 사용자 검증을 하는 ssm API를 호출하고 group, product, creative, point API를 호출합니다.

![](/assets/image/posts/2020-12-30-axios-integration-04.png)<br/>
*한 페이지에서 100개의 API를 쏜다면 100번 session API를 쏘는 소오름*

마침 이러한 flow를 만든 것이 저였기에, 조금만 더 고민과 노력을 해달라고 하시면서 저를....<br/>
![](/assets/image/posts/2020-12-30-axios-integration-02.jpeg)<br/>
*쪼였으니 일해야 합니다*

# 해결해야지...
기존에 최선이라고 생각했었던 로직에 대해 한 번 더 생각하는 시간을 가졌습니다. 한 페이지 안에서 각각의 독립적인 컴포넌트가 API를 호출하기 때문에 어떻게 해야 API 통신을 한 줄기로 만들 수 있을지 많은 고민을 했습니다. 그리고 파트원들과 고민을 나누면서 고통도 같이 나눴습니다.<br/>
![](/assets/image/posts/2020-12-30-axios-integration-05.jpeg)<br/>
*나만 죽을 수 없다!*

해결하기 위해서 여러 가지 방법을 생각했습니다.  

**첫 번째는** axios cancel token을 이용해서 핸들링하려고 했으나, 요청을 취소할 경우 access-token이 복구되었을 때를 알아차리지 못하고 요청을 다시 보내지 못하기 때문에 실패했습니다.

**두 번째는** 호출하는 API들을 한곳에 모아서 쏴 보자는 것이었습니다. 각각의 컴포넌트에서 최상단까지 올리고, ssm API 성공(사용자 검증)한 경우에만 나머지 API들이 통신할 수 있도록 만드는 것이었습니다. 하지만 만드는(*삽질하는*) 도중 좋은 생각이 났습니다.

**세 번째 좋은 생각은** 제일 앞에서 API들을 묶어볼 생각으로 찾다 보니 vue navigation guard가 나왔습니다.  
이 방식은 axios에서 intercept 하는 방식이 아닌, 사용자가 웹 진입 당시에 refresh-token, access-token을 체크하고, 새로운 토큰 값을 가져오는 session API를 호출하는 것입니다. 그 후 웹 진입을 하기 때문에 session API를 여러 번 호출하지 않을 것 같았습니다.

![](/assets/image/posts/2020-12-30-axios-integration-06.png)
```javascript
router.beforeEach(async (to, from, next) => {
    if (!Vue.$cookies.get('access-token') && Vue.$cookies.get('refresh-token')) {
        const { meta } = await loginService().session();
        if (meta.result === 'fail') return next('/login');
        
        return next();
    }
    return next();
});
```
Vue.js의 navigation guard 코드 일부분입니다. 진입 당시 토큰 여부에 따라 어디로 보낼지 정합니다. 만약 사용자가 refresh-token만 갖고 있다면 session API를 호출하고 실패한다면 로그인 페이지로, 성공한다면 새로운 access-token으로 각각의 컴포넌트에서 API를 호출합니다.
 
결과는 성공적이었습니다.   
사용자가 페이지 진입 시, 각각의 컴포넌트들이 API 호출하기 전에 session, ssm API를 호출하게 되었고, 그 결과, 엮이지 않고 API 통신이 잘 되는 것을 확인했습니다.<br/>
![](/assets/image/posts/2020-12-30-axios-integration-07.png)

# 끝으로
정답이 무엇인지도 모르는 상황에서 정답을 찾는 것은 매우 힘들었습니다. 하지만 이 문제를 해결했을 때 엄청난 성취감과 뿌듯함이 저를 채워줬습니다. 그리고 문제를 해결함으로써 로그인, API 통신 관련 도메인 지식을 많이 쌓게 되었으며, 이 분야는 당당하게 자신 있다고 할 수 있게 되었습니다(자신감과 능력은 별개입니다).
주니어 개발자가 중요한 부분을 계속 건드리고 있어서 불안하실 법도 한데, 개선할 수 있도록 같이 고민해 주시고 믿고 맡겨주셔서 감사했습니다.

# 후기가 남아있습니다.
예전부터 용화 님(CTO)이 밑밥을 많이 뿌린 회사 기술 블로그에 글을 쓰게 되었습니다. 딜리셔스 개발팀의 기술력을 널리 전파하고, 내부적으로는 파트 간 기술을 공유할 수 있다는 장점이 있지만, 저는 자칫 관리를 안 하게 되면 만든 것만도 못한다고 생각했기 때문에 위험성도 클 것 같았습니다. ~~잘 쪼아주시겠지~~ <br/>
![](/assets/image/posts/2020-12-30-axios-integration-08.jpg)<br/>
![](/assets/image/posts/2020-12-30-axios-integration-09.jpg)<br/>
![](/assets/image/posts/2020-12-30-axios-integration-10.jpeg)<br/>
*이번엔 여러 명이 쪼고 있습니다.*

*또 쪼였으니 일해야 합니다.*

평소에 장난스럽게 끄적끄적 쓰던 글이 아닌 회사 기술 블로그 첫 글이라 진지하게 써야 한다는 점에서 부담을 많이 느꼈습니다. 그래도 글을 정리하면서 업무에 필요한 기술을 제대로 한 번 더 공부할 수 있는 기회가 되고, 회사 블로그에 내가 쓴 글이 올라간다는 점이 뿌듯해서 더욱 열심히 쓰게 되었습니다.

부족하지만 끝까지 읽어주셔서 감사합니다.
