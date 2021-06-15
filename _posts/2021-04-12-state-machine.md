---	
layout: page	
title:  "상태 일병 구하기 - State Machine"	
writer: 장중수
description: "State Machine으로 광고 소재의 상태를 안전하게 관리하기"
tags: [Java, Spring Boot, State Machine]
thumbnail: 'posts/2021-04-12-state-machine/creative_state_diagram.png'	
---

# 들어가며

딜리셔스 광고 검색 파트에서는 [**AD-TECH**](https://epom.com/blog/ad-server/ad-tech-101) Architech를 토대로 [**신상애드**](https://www.youtube.com/playlist?list=PL4vwD5KSl23aBsVdXSbpzjYoZ6RD70xgi) 광고플랫폼을 개발하고 있습니다.

신상애드 광고플랫폼은 광고의 소재(Creative) 단위로 광고를 생성할 수 있는데,
소재의 상태에 따라서 광고의 노출 여부가 관리 되고 있기 때문에 소재의 상태가 매우 중요합니다.

소재의 상태를 안전하게 보호하고 이해하기 쉽게 나타내기 위해서 State Machine을 적용하게 되었습니다. 

여기서는 State Machine에 대해 소개하고 실서비스에 적용하는 과정을 살펴 보겠습니다. (Java, Spring Boot, gradle을 기반하여 작성되었습니다.)

# 유한 상태 기계(Finite-State Machine, FSM)란?

유한한 개수의 상태를 가질 수 있는 추상 기계를 말합니다.

```
* State Machine으로 모델링 된 시스템은 유한한 개수의 상태(State)를 갖게 된다.
* 이러한 기계는 어떠한 사건(Event)에 의해 다른 상태로 변화할 수 있다. 이를 전이(Transition)라 한다.
```

정리하면, State Machine은 현재 상태로부터 가능한 전이 상태와, 전이를 유발하는 조건들의 집합으로 정의할 수 있습니다.

예를 들어 우리 생활에서 쉽게 볼 수 있는 신호등을 State Machine으로 간단히 표현해 봅시다.

```
* State : 적색등, 황색등, 녹색등
* Event : 15초(시간)
* Transition : 녹색의 등화 -> 황색의 등화 -> 적색의 등화 ...
```

즉, 신호등은 세 가지 State를 갖고 특정 시간 경과라는 Event를 통해 다른 상태로 Transition 됩니다.

# 신상애드 광고 소재의 State Diagram

먼저 소재의 State Diagram을 살펴 보겠습니다.

![](/assets/image/posts/2021-04-12-state-machine/creative_state_diagram.png)

일면 복잡하게 보이지만 앞서 살펴본 신호등과 크게 다르지 않습니다.

* State : draft, submitted, waiting, active, blocked, inactive, completed, rejected, deleted
* Event : 광고 신청, 심사 통과, 노출 시작, 일시 정지, 상품 변경, 기간 만료, 삭제, 심사 거절 ...
* Transition : draft -> submitted -> waiting -> active -> complted ...

광고 소재 역시 State, Event, Transition으로 구성되어 있고 State는 특정 Event를 통해 Transition 되고 있습니다.

# State Diagram

하나의 객체를 대상으로 생존 기간 동안 가질 수 있는 객체 상태의 변화를 나타내는 Diagram입니다.
상태의 변화, 변화를 발생시키는 이벤트, 이벤트 후의 동작도 함께 정의하게 됩니다.

![](/assets/image/posts/2021-04-12-state-machine/state_diagram_1.png)

* Initial State : 초기 상태 값
* State : 상태 값
* Transition : 상태 전이
* End State : 완료 상태 값

여기서 Transition에 대해서 조금 더 살펴 보겠습니다.

![](/assets/image/posts/2021-04-12-state-machine/state_diagram_2.png)

* Source State : 원래 상태
* Event : Transition을 발생시키는 사건
* Guard : Transition 발생 시 검토되는 Boolean 식 (true 일때 Transition이 일어남)
* Action : Transition 발생 후 수행되는 행위
* Target State : 목표 상태

**주의점**
* Black Hole State를 주의해야 한다. (상태는 in, out에 대한 Transition이 모두 정의되어야 한다.)
* 일관성을 가지고 State Diagram을 구현해야 한다.

# State Machine 적용하기

신상애드 플랫폼은 State Diagram을 통해 광고 소재의 상태 정의부터 시작했는데, 구현 단계에서는 Spring의 [**spring-statemachine**](https://projects.spring.io/spring-statemachine/) 을 참조하게 되었습니다.

개발 진행에 앞서 State Machine을 사용하기 위해 프로젝트 세팅을 진행합니다.

### 의존성
```
org.springframework.statemachine:spring-statemachine-core:2.4.0
```

### State enum, Event enum 정의

State에 대한 `enum class`를 정의하고 Transition을 일으키는 Event에 대해서도 `enum class`를 정의합니다.

```java
public enum CreativeStates {
	DRAFT,
	SUBMITTED,
	WAITING,
	WAITING_INACTIVE,
	ACTIVE,
	INACTIVE,
	BLOCKED,
	DELETED,
	COMPLETED
}

public enum CreativeEvents {
	ReviewStartedEvent,
	ReviewPassedEvent,
	ReviewRejectedEvent,
	ReviewCancelEvent,
	PauseEvent,
	ResumeEvent,
	ArchivedEvent,
	LiveStartedEvent,
	DateChangeEvent,
	DateExpiredEvent,
	BlockEvent
}
```

### Configuration 정의

State에 대한 `enum class`를 State Machine에 등록해 주고, Transition을 정의합니다.

* State Machine에 상태 등록
	* `initial` : 초기 상태값
	* `state` : 변경 단계의 상태값
	* `end` : 마지막 상태값
* Transition 정의
	* `source` : 현재 상태값
	* `target` : 변경될 상태값
	* `event` : `source` -> `target`으로 전이시킬 이벤트
	* `action` : 상태 전이후 수행할 명령
	* `guard` : true를 반환해야 `source` -> `target`으로 상태 전이가 동작함

```java
@Configuration
@EnableStateMachineFactory
@RequiredArgsConstructor
public class Configure extends StateMachineConfigurerAdapter<CreativeStates, CreativeEvents> {

    private final StateMachineConfigurerService stateMachineConfigurerService;

    @Override
    public void configure(StateMachineStateConfigurer<CreativeStates, CreativeEvents> states) throws Exception {
        states.withStates()
                .initial(CreativeStates.DRAFT)
                .state(CreativeStates.SUBMITTED)
                .state(CreativeStates.WAITING)
                .state(CreativeStates.ACTIVE)
                .state(CreativeStates.INACTIVE)
                .end(CreativeStates.DELETED)
                .end(CreativeStates.COMPLETED);
    }

    @Override
    public void configure(StateMachineTransitionConfigurer<CreativeStates, CreativeEvents> transitions) throws Exception {
                transitions
                        .withExternal()
                            .source(CreativeStates.SUBMITTED)
                            .target(CreativeStates.DELETED)
                            .guard(isOnceActivated())
                            .event(CreativeEvents.AdArchivedEvent)
                            .and()
                        .withExternal()
                            .source(CreativeStates.WAITING)
                            .target(CreativeStates.DELETED)
                            .guard(isOnceActivated())
                            .event(CreativeEvents.AdArchivedEvent)
                        .withExternal()
                            .source(StateManager.CreativeStates.INACTIVE)
                            .target(StateManager.CreativeStates.ACTIVE)
                            .guard(releaseInactive())
                            .event(StateManager.CreativeEvents.ResumeEvent)
                            .action(addPoolAction())
                            .and()
                        .withExternal()
                            .source(StateManager.CreativeStates.BLOCKED)
                            .target(StateManager.CreativeStates.COMPLETED)
                            .guard(isOnceActivated(true))
                            .event(StateManager.CreativeEvents.ArchivedEvent)
                            .and();
    }
    
    public Action<StateManager.CreativeStates, StateManager.CreativeEvents> addPoolAction() {
        return context -> this.stateManagerConfigurerService.insertCreativeFromPool((Long) context.getMessage().getHeaders().get(headerKey));
    }

    public Guard<StateManager.CreativeStates, StateManager.CreativeEvents> isOnceActivated(Boolean is) {
        return context -> is.equals(this.stateManagerConfigurerService.isCreativeOnceActivated((Long) context.getMessage().getHeaders().get(headerKey)));
    }
```

Transition중 하나를 자세히 살펴 보겠습니다.

광고의 소재가 일시정지 상태 에서 활성화되어 광고가 집행되는 Transition입니다.

* `source` : `INACTIVE`
* `target` : `ACTIVE`
* `event` : `ResumeEvent`
* `action` : 광고 Pool에 소재를 등록함
* `guard` : 소재의 광고 집행기간이 유효해야 함

```java
.withExternal()
	.source(StateManager.CreativeStates.INACTIVE)
	.target(StateManager.CreativeStates.ACTIVE)
	.guard(releaseBlocked())
	.event(StateManager.CreativeEvents.ResumeEvent)
	.action(addPoolAction())
	.and()
```

`ResumeEvent`가 발생하면 `INACTIVE` -> `ACTIVE` 로 상태가 변하게 됩니다.
이때 `guard`가 동작되어 소재의 광고 집행 기간이 유효해야만 상태가 변화합니다.
정상적으로 Transition이 진행되면 `action`이 수행되어 광고 Pool에 소재가 등록되어 광고가 노출되게 됩니다.

### State Machine Interceptor

Interceptor는 State가 Transition 되고난 후에 수행됩니다.
State Machine에 Event를 등록하고 Start 하기 전에 Interceptor를 등록합니다. (Interceptor를 등록하는 부분은 아래에서 다시 다루겠습니다)
광고 소재 Index를 Interceptor에 등록하고 해당 Index에 맞는 소재의 State DB Update를 수행합니다.

```java
@Component
@RequiredArgsConstructor
public class StatesChangeInterceptor extends StateMachineInterceptorAdapter<StateManager.CreativeStates, StateManager.CreativeEvents> {

    private final CreativeRepository creativeRepository;

    @Override
    public void preStateChange(State<StateManager.CreativeStates, StateManager.CreativeEvents> state,
                               Message<StateManager.CreativeEvents> message,
                               Transition<StateManager.CreativeStates, StateManager.CreativeEvents> transition,
                               StateMachine<StateManager.CreativeStates, StateManager.CreativeEvents> stateMachine) {
        Optional.ofNullable(message).flatMap(msg -> Optional.ofNullable((Long) msg.getHeaders().getOrDefault(headerKey, -1L))).ifPresent(id -> {
            Creative creative = creativeRepository.getOne(id);
            creative.changeState(state.getId());
            creativeRepository.save(creative);
        });
    }
}
```

### State Event Service

Service는 State Machine에 Event를 발송하는 부분 입니다.

각각의 서비스를 수행하는 Class에서는 `StateEventService`를 통해서 상태를 변화시킬 수 있습니다.

```java
@Service
@RequiredArgsConstructor
public class StateEventService {

    private final CreativeRepository creativeRepository;
    private final StateMachineFactory<StateManager.CreativeStates, StateManager.CreativeEvents> stateMachineFactory;
    private final StatesChangeInterceptor statesChangeInterceptor;
    
    @Transactional
    public Creative created(Creative creative) {
        creative.created();
        return creativeRepository.save(creative);
    }

    @Transactional
    public void active(Long creativeIdx) {
        StateMachine<StateManager.CreativeStates, StateManager.CreativeEvents> sm = build(creativeIdx);
        sendEvent(creativeIdx, sm, StateManager.CreativeEvents.ReviewStartedEvent);
        sendEvent(creativeIdx, sm, StateManager.CreativeEvents.ResumeEvent);
    }

    @Transactional
    public void inactive(Long creativeIdx) {
        StateMachine<StateManager.CreativeStates, StateManager.CreativeEvents> sm = build(creativeIdx);
        sendEvent(creativeIdx, sm, StateManager.CreativeEvents.ReviewCancelEvent);
        sendEvent(creativeIdx, sm, StateManager.CreativeEvents.PauseEvent);
    }

    private void sendEvent(Long creativeIdx, StateMachine<StateManager.CreativeStates, StateManager.CreativeEvents> sm, StateManager.CreativeEvents event) {
        Message<StateManager.CreativeEvents> msg = MessageBuilder.withPayload(event)
                .setHeader(headerKey, creativeIdx)
                .build();
        sm.sendEvent(msg);
    }

    private StateMachine<StateManager.CreativeStates, StateManager.CreativeEvents> build(Long creativeIdx) {
        Creative creative = creativeRepository.getOne(creativeIdx);
        StateMachine<StateManager.CreativeStates, StateManager.CreativeEvents> sm = stateMachineFactory.getStateMachine(Long.toString(creativeIdx));
        sm.stop();
        sm.getStateMachineAccessor().doWithAllRegions(sma -> sma.addStateMachineInterceptor(statesChangeInterceptor));

        sm.getStateMachineAccessor()
                .doWithAllRegions(sma -> {
                    sma.addStateMachineInterceptor(statesChangeInterceptor);
                    sma.resetStateMachine(new DefaultStateMachineContext<>(creative.getCreativeStates(), null, null, null));
                });

        sm.start();
        return sm;
    }
}
```

위의 코드를 수행 순서대로 살펴보면,

* `StateMachine` 수행
	* `StateMachine.stop()` 수행
	* `StateMachine` Interceptor 등록
	* 상태값 초기화
	* `StateMachine.start()` 수행
* `sendEvent` 수행
	* Transition 후 수행되는 `action`에서 사용될 `Message` 생성
	* `Message`에 수행될 `StateEvent` 셋팅
	* `StateMachine`에 `sendEvent`요청

# 정리

State Machine은 아래와 같은 형태로 관리됩니다. 

![](/assets/image/posts/2021-04-12-state-machine/state_machin_class.png)

* 좌측 BOX는 State Machine입니다.
	* State에 대한 `enum` 정의와, Event `enum` 정의, Transition 관리 등 State Machine이 수행되는 부분입니다.

* 중앙에 위치한 `StateEventService`는 다른 Service Class에서 접근 합니다.
	* State Machine에 Event 및 Interceptor를 등록합니다.
	* State Machine을 Stop, Start하여 Transition이 동작하도록 조절합니다.

그림에서도 볼 수 있듯이 각각의 기능을 수행하는 Class에서는 State에 관해 직접적으로 관여하지 않고 State Machine은 독립되어 있습니다.
오직 `StateEventService`의 Method만 호출하여 State의 변화를 줄 수 있습니다.


# 마치며

간단히 State Machine을 적용해 보았습니다.

**장점으로는,**

* State의 변화를 State Machine에서 관리하여 상태 변화에 대한 공통 로직 관리가 가능하다.
* `StateChangeInterceptor`에서만 상태값 DB Update가 일어나기 때문에 데이터가 안전하게 관리된다. 
* 다른 기능을 수행하는 Class에서는 State의 변경에 대해 고민하지 않아도 되기 때문에 로직이 기능 수행에만 집중할 수 있다.
* State Diagram을 개발 전에 정의해서 구현 단계에서는 State에 대한 변경이 전혀 일어나지 않았다.
* `guard`를 통해서 강제로 상태가 변경되는 것을 방지할 수 있어 안정성이 높아졌다.
* State Transition후 `action`을 통해 일관된 동작을 수행할 수 있어 안정성이 높아졌다.

**단점으로는,**

* 아직까지는 찾지 못했습니다?

# Bonus

다른 언어에서도 State Machine을 지원하는 라이브러리를 쉽게 찾을 수 있습니다.

* [Ruby on Rails](https://github.com/aasm/aasm)
* [Python](https://pypi.org/project/python-statemachine/)
* [Node](https://www.npmjs.com/package/javascript-state-machine)

# References
* [AD-TECH](https://epom.com/blog/ad-server/ad-tech-101)
* [도로교통공단](https://www.koroad.or.kr/kp_web/knTrafficSign2-04.do)
* [spring-statemachine](https://projects.spring.io/spring-statemachine/)