---
layout: page
title: '딜리셔스 개발팀의 toy project'
writer: 서혜리
description: "딜리셔스 개발팀 (현 연구개발센터)의 자유로운 토이프로젝트 문화에 대해서 자랑해 보았습니다."
tags: [culture, module, Ruby on Rails, refactoring]
thumbnail: 'posts/2020-12-30-toy-project-04.png'
---

# 1. 들어가기 전

안녕하세요. 딜리셔스의 주니어 백엔드 개발자 서혜리입니다.  

딜리셔스는 널리 알리고 싶은 장점이 참 많은 회사인데요, 그 중에 한가지는 바로 개발자의 애증, 토이 프로젝트 문화입니다.  
 
때는 바야흐로 2019년 12월 #general 채널에 이런 메시지가 올라왔습니다.

![](/assets/image/posts/2020-12-30-toy-project-01.png)

회사 차원에서 토이 프로젝트에 대한 시간적, 리소스적 지원을 하겠다는 CTO의 공표가 바로 그것이었습니다. 이에 저희는 합법적으로(!) 회사에서 토이 프로젝트 개발을 할 수 있게 되었습니다. (두둥)

그 이후로 1년의 시간이 흘렀고 그동안 다양한 토이 프로젝트들이 진행이 되었습니다. 그 중 제가 백엔드 파트에 합류한지 5개월차에 진행했던 토이 프로젝트에 대해 소개하려고 합니다.

# 2. 사건의 발단

제가 속한 백엔드 파트에서는 매일 아침 데일리 스탠드업 미팅을 하는데요, 여기서 사용해 보고 싶은 기술이나 서비스 또는 진행해 보고 싶은 프로젝트에 대한 아이디어를 내고 작게 팀을 꾸려 토이 프로젝트를 실행하곤 합니다. 당시에도 여러가지 아이디어들이 나왔고 그 중의 하나가 이미지 중복에 관한 이슈였습니다.

![](/assets/image/posts/2020-12-30-toy-project-02.png)
*신상마켓 웹 화면*

딜리셔스의 메인 서비스인 신상마켓 앱에는 월 180만개 이상의 상품이 업로드 됩니다 (2020년 10월 기준). 그리고 상품이 많이 노출될수록 판매량이 상승하는 경향이 있는만큼 전에 올린 상품이라도 중복해서 등록하는 일도 종종 생기곤 합니다.  
당시는 이미지 리사이저와 캐시 시스템을 막 리뉴얼한 이후였는데요, 성공적으로 캐시 시스템을 적용했지만 그 효율이 기대에 미치지는 못했습니다. 중복 상품과 여기에 따른 중복 이미지의 경우에는 기껏 캐싱한 이미지를 다시 찾아 쓰지 못하고 사실상 같은 이미지를 계속해서 캐싱하는 일이 발생했기 때문입니다.

이미지 서버의 부하를 줄이고 낭비되는 스토리지 사용량을 줄이기 위해서 저희는 이미지를 재사용할 필요가 있었습니다. 

>"이거 엄청 쉬울 것 같은데 해보고 싶으신 분?"  
>
>"저요!"

그때 마침 저는 푸시 시스템 개발 프로젝트를 마치고 시간적으로 여유가 있던 상황이었고, 파트장의 쉬울 것이라는 얘기에 혼자서 Hola 프로젝트를 시작하게 됐습니다.

![](/assets/image/posts/2020-12-30-toy-project-03.jpg)
*프로젝트 이름의 의미 : 이미지를 올리니까 올라... Hola...*

# 3. 어떻게 해결했나

여러가지로 고민을 했지만 사실 접근 방법 자체는 파트장의 얘기처럼 굉장히 간단했습니다.

![](/assets/image/posts/2020-12-30-toy-project-05.png)

중심이 되는 로직은 이게 전부였거든요. 그래서 가벼운 마음으로 작업을 시작하려고 보니...

![](/assets/image/posts/2020-12-30-toy-project-04.png)
*알록달록 무지개 인덴테이션*

이렇게나 굉장한 복잡도의 친구가 저를 기다리고 있었습니다. 그래서 저는 가벼운 마음으로 모듈화부터 시작했습니다. (하핫)

## 기존 API

![](/assets/image/posts/2020-12-30-toy-project-06.png)

일단 기존 API는 이렇게 요청이 들어온 모든 이미지를 *AWS S3*에 저장하고 있었습니다. 그리고 저장한 이미지의 주소를 MySQL *상품 이미지 테이블*에 저장을 했습니다.

새로운 이미지만 저장을 하기 위해서는 이미지의 중복 여부를 체크해야 했는데요, 이 또한 아주 간단하게 해결을 했습니다.

## 바뀐 API
 
![](/assets/image/posts/2020-12-30-toy-project-07.png)

*상품 이미지 테이블*과 별도로 *상품 이미지의 Hash를 저장하는 테이블*을 새로 생성했습니다. 그리고 이미지를 등록할때마다 S3에 바로 저장하는 게 아니라 이미지의 MD5 Hash를 구한 뒤, *Image Hash 테이블*에 기존 Hash가 있는지 확인하는 방식으로 중복을 체크했습니다. 그리고 Hash가 존재하지 않는다면 이미지 업로드 후 URL과 Hash를 *Image Hash 테이블*에 저장했고, 동일한 데이터를 *상품 이미지 테이블*에도 저장해 주었습니다.  

![](/assets/image/posts/2020-12-30-toy-project-08.png)

반대로 Hash가 존재한다면 *Image Hash 테이블*에 저장되어 있는 URL을 가져와 *상품 이미지 테이블*에 저장해 주었습니다.

참고로 도식에는 그리지는 않았지만 기존 API에도 이미지의 중복 체크 로직이 존재했는데, 중복 체크를 PHP의 *imagehash 라이브러리*에 의존하고 있어 레거시 서버를 Java 및 Rails로 이전하고 있는 백엔드 파트의 현재 상황과 잘 맞지 않았습니다. 때문에 언어나 플랫폼에 의존적이지 않으면서 비교적 해싱 속도가 빠른 MD5를 선택하게 되었습니다.

그리고 이미지 업로드 및 이미지 중복에 대한 데이터를 쌓기 위해 *AWS Kinesis Firehose*로 로그를 스트리밍하여 저장했습니다. 이후에는 *Athena*로 데이터를 쉽게 쿼리할 수 있도록 날짜와 시간을 기준으로 파티셔닝 해주었습니다.

![](/assets/image/posts/2020-12-30-toy-project-09.png)

이러한 구성으로 비교적 간단하지만 기존의 비즈니스 로직을 그대로 가져가면서 이미지의 중복을 체크할 수 있게 되었습니다. 

### 4. 결과는 어땠나

좋은 설계를 위해 고민을 많이 했지만 구현 자체에 드는 시간은 비교적 짧았고 결과적으로는 제법 성과가 있었습니다.

![](/assets/image/posts/2020-12-30-toy-project-10.png)

위의 이미지는 프로젝트가 끝난 후에 사내에 공유했던 통계입니다. 그래프를 보시면 배포 직후에는 이미지 중복 여부를 구분할 수 있는 Image Hash 데이터가 없는 상태이기 때문에 중복 이미지의 수가 새로운 이미지에 비해 훨씬 적지만, 시간에 지남에 따라 증가함을 알 수 있습니다. 이는 업로드 수 뿐만 아니라 업로드된 파일 용량 역시 비슷한 추세를 보입니다. 

![](/assets/image/posts/2020-12-30-toy-project-11.png)

위는 2020년 11월의 데이터입니다. Image Hash 데이터가 충분히 쌓인 지금은 평균적으로 전체 대비 70퍼센트의 이미지에 대해 중복으로 처리하고 있으며, 그만큼의 성능 향상 및 저장소 용량을 절약하고 있다는 것을 볼 수 있습니다. 그리고 상품의 중복과 이미지의 중복에 대한 데이터를 추가적으로 제공할 수 있었다는 의미도 있었습니다.

![](/assets/image/posts/2020-12-30-toy-project-12.png)

위 이미지는 이미지 캐시 및 리사이저 서버의 요청에 대한 통계입니다. Hola 프로젝트를 릴리즈한 시점과 비슷하게 WAF 요청수 대비 이미지 리사이저 서버의 요청이 줄어드는 것을 볼 수가 있습니다.

사실 Hola 릴리즈와 비슷한 기간에 캐시의 만료 시간을 늘리기도 해서 (그래프의 빨간선이 만료 시간을 늘린 시점입니다) 이 데이터만으로 100% 정확히 Hola의 결과를 알 수는 없지만, Hola의 이미지 중복 판별 로직으로 서버의 부하를 줄이는데 크게 도움을 줬을 것이라는 합리적인 추론을 해 볼 수 있습니다.

# 5. 기타 등등 프로젝트
 
위에서 얘기한 hola처럼 업무와 관련된 토이프로젝트 말고도 오로지 재미를 위한 프로젝트들도 많았습니다.  

![](/assets/image/posts/2020-12-30-toy-project-13.png)
*원격으로 카페테리아 노래를 틀 수 있는 딜리비트*
 
![](/assets/image/posts/2020-12-30-toy-project-14.jpeg)
*천하제일탁구대회 선수소개 페이지*
 
![](/assets/image/posts/2020-12-30-toy-project-15.jpeg)
*천하제일탁구대회 경기판*

![](/assets/image/posts/2020-12-30-toy-project-16.png)
*연말을 맞아 제작중인 딜리셔스 미궁게임*

# 6. 결론

개발팀 차원의 토이 프로젝트 지원 이후 1년 정도의 시간이 흘렀습니다. 결과적으로 봤을 때 토이 프로젝트는 개인의 성장은 물론이고 회사의 발전에도 도움이 되었던 것 같습니다.

개인적으로는 단독으로 프로젝트를 끝까지 진행하고 그 결과물로 일정 부분의 성과를 냈다는 점, 그리고 경험해 보지 않았던 기술을 적용해 봤다는 점에서 매우 좋은 경험이었습니다.

또한 누가 시켜서 하는 일이 아닌, 팀 내부에서 자율적으로 문제점을 찾아 개선해 나가는 과정도 의미가 있다고 생각합니다. 그런 의미에서 토이 프로젝트 문화는 딜리셔스 개발팀에서 계속 지켜나가고 발전시켜야 할 좋은 문화인 것 같습니다.

