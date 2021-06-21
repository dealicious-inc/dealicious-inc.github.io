---    
layout: page    
title:  "Swift 금액 입력 애니메이션 뷰 개발 일지"    
writer: 유현지
description: "UIStackView의 능력을 최대한 이끌어내 보자"
tags: [iOS, Swift, UIStackView, animation, CocoaPod]
thumbnail: 'posts/2021-02-22-swift-animation-view-01.gif'    
---

# 배경

서비스에 간편 결제 기능이 추가되면서 금액 입력 애니메이션에 관한 디자인팀의 개발 요청이 있었습니다. 클라이언트 주니어 개발자로서 애니메이션 개발은 매우 흥미로운 작업이기에, ~~손을 번쩍 들고~~ 담당자가 되었습니다.

금액 입력 애니메이션이 적용된 뷰는 범용성이 있기 때문에 CocoaPods으로 관리할 수 있는 라이브러리 형태로 개발하였고, 이 글에서는 개발 과정과 함께 느낀 점을 공유하고자 합니다.

---

# 브레인스토밍

## 결과물

![/assets/image/posts/2021-02-22-swift-animation-view-01.gif](/assets/image/posts/2021-02-22-swift-animation-view-01.gif)

## 기능 정의

### 애니메이션

이미 타 서비스에 다양한 레퍼런스들이 존재했고, 논의 결과 적용할 애니메이션을 크게 세 가지로 정의했습니다.

- 입력된 숫자는 표시된 금액의 맨 뒤에 낙하
- 지워질 숫자는 표시된 금액의 맨 뒤에서 서서히 옅어지며 상승
- 최대 금액을 초과할 시 뷰 전체가 떨리는 효과

### 뷰 기능

애니메이션이 정의되었으니, 서비스에서 필요한 뷰의 기능을 정의할 차례입니다.

- 숫자 입력 전 placeholder
- 금액 + 통화(원)의 형태
- 금액이 변할 때 세 자리마다 쉼표(,) 삽입
- 최소/최대 금액 설정, 최대 금액 초과 시 강제로 최대 금액으로 변환
- 현재 금액이 얼마인지 표기해 주는 인디케이터(ex. 1만 원, 5만 원)
- 숫자의 입력/삭제를 받을 수 있는 함수

### 추가 고려사항

평소라면 여기까지 정리하고 넘어갔겠지만, 이 뷰는 라이브러리이기 때문에 다른 앱에서 사용할 수 있도록 범용성을 고려한 작업도 생각해야 했습니다.
```
"내가 다른 서비스의 iOS 개발자라면 이 라이브러리의 어느 부분을 커스텀 하고 싶을까?"
```
라는 주제로 개발자 MC고요님과 논의 후 추가로 고려해야 할 점들을 정의할 수 있었습니다.

- 금액의 폰트, 컬러 커스텀
- placeholder의 내용, 폰트, 컬러 커스텀
- `UITextField`(예시)처럼 attribute 세팅하는 방식이 깔끔할 것

 

## 구현 방식 정의

기능 정의를 했으니 구현 방식을 정해야 할 차례입니다.

개발적인 관점에서 이 뷰의 핵심은 다음과 같습니다.```

```
숫자와 쉼표(,)의 추가와 삭제에 따라 전체 레이아웃이 자연스럽게 정렬, 조정되는 것
```

가장 쉽게 떠올릴 수 있는 방법은 숫자와 쉼표(,)가 추가/삭제될 때마다 모든 뷰의 좌표값을 계산하고 위치를 애니메이션으로 조정하는 방식입니다. 하지만 이는 너무 정신건강에 해로운 방법(a.k.a. ~~삽노가다~~)이므로 빠르게 다음 방법을 떠올려야만 했습니다.

그러던 중 최근 `UIStackView`를 사용해서 데이터의 유무에 따라 레이아웃이 조정되는 UI 작업을 했던 것이 떠올랐고, 바로 `UIStackView`에 관한 [Apple Developer 문서](https://developer.apple.com/documentation/uikit/uistackview)를 검색했습니다.

> Stack views let you leverage the power of Auto Layout, (...) The stack view manages the layout of all the views in its arrangedSubviews property. (...)

문서의 Overview만 읽어도 위 방식의 ~~삽노가다~~를 스택뷰가 대신해줄 것이라는 확신이 들었습니다. 기쁜 마음으로 정독하니 스택뷰를 이용한 구현 방식을 정리할 수 있었습니다.

기본 구현 방식은 다음과 같습니다.

- 뷰에 입력되는 것(숫자, 통화, 쉼표)들은 모두 `UILabel`의 형태로 `UIStackView`에 add/remove 시킨다.
- `UIView`를 상속하며, 전체를 채울 `SubView`는 입력된 금액의 유무에 따라 두 개로 나눈다.
    1. placeholder 역할을 하는 `UILabel`
    2. 숫자, 통화(원), 쉼표(,)가 들어갈 `UIStackView`
- `UIStackView`의 arrangedSubviews 배열을 통해 애니메이션이 적용될 `UILabel`에 접근한다.

이 정도 기반을 다져놓고, 본격적인 개발을 시작했습니다.

---

# 개발 과정

(전체 소스는 **[깃허브](https://github.com/yoosa3004/AmazingPriceView)**에서 볼 수 있습니다.)

## 플로우차트

뷰에 들어오는 인풋(숫자 입력/삭제/클리어)에 따른 로직을 설명한 차트입니다.

![/assets/image/posts/2021-02-22-swift-animation-view-02.png](/assets/image/posts/2021-02-22-swift-animation-view-02.png)


## 주요 개발

### 초기화

- 이 뷰는 초기화 시 설정된 최대 금액에 따라 `UIStackView`에 숫자가 들어갈 `UILabel`들을 미리 add 시켜두도록 구현되어 있습니다.
- 뷰에 입력할 수 있는 최대 금액을 변경할 수 없기 때문에 인풋이 들어올 때마다 `UILabel`을 생성해서 add/delete 시키는 것보다 미리 생성해 두고 show/hidden 시키는 방식이 더 효율적이라고 판단했기 때문입니다.

```swift
private func initNumberViews() {
    // ...전략...
    var maxPrice = self.maximumPrice
    while(maxPrice > 0) {
        self.numberLabelCount += 1
        maxPrice /= 10
    }
    self.currencyView = CurrencyView(text: self.currency, font: self.font, fontColor: self.fontColor)
        
    for _ in 1...self.numberLabelCount {
        let numberLabel = UILabel()
        numberLabel.isHidden = true
        numberLabel.alpha = 0.0
        numberLabel.textAlignment = .center
            
        numberLabel.font = self.font
        numberLabel.font.withSize(self.fontSize)
        numberLabel.textColor = self.fontColor
        numberLabel.text = "0"
            
        numberLabel.widthAnchor.constraint(equalToConstant: numberLabel.intrinsicContentSize.width + 1.0).isActive = true
        self.numberStackView.addArrangedSubview(numberLabel)
    }
        
    self.numberStackView.addArrangedSubview(self.currencyView)
}
```

### 숫자 레이블의 하강 애니메이션 처리

숫자가 입력될 때 레이블이 하강하며 나타나는 애니메이션이 적용돼야 합니다.

- **자연스러운 효과를 위한 조건**
    1. 숫자 레이블이 하강하기 전 (마지막 숫자 레이블)-(원 레이블) 사이가 미리 벌어져 있어야 합니다.
    2. 하강할 때 레이블의 알파 값이 (0.0 → 1.0) 점진적으로 변환되어야 합니다.

- **조건 충족 방법**
    1. 초기화 당시 스택 뷰에 미리 hidden 된 레이블들을 넣어놨기 때문에, 알파 값이 0.0일 때 미리 hidden을 풀어주면 스택 뷰가 알아서 레이블이 들어갈 공간을 만들어줍니다.
    2. 레이블이 hidden → show가 되면 알파 값을 `UIView.animate()` 함수를 사용해 서서히 0.0 → 1.0이 되게 합니다.

- **애니메이션 처리 순서**
    1. 레이블의 transform.y 값을 -40으로 세팅
    2. `UIView.animate()` 시작
        - 레이블의 hidden → show (알파 값은 0.0이기 때문에 보이진 않는 상태)
    3. 2번 animation complete 후 핸들러에서 `UIView.animate()` 시작
        - 레이블의 transform.y 값을 0으로 이동
        - 레이블의 알파 값 0.0 → 1.0 처리

- **코드**

```swift
private func insertNumberAnimation(_ num: Int) {
    var digitNum = 0
    var currentPrice = self.price
    while(currentPrice > 0) {
        digitNum += 1
        currentPrice /= 10
    }
        
    self.removeFloatingPoint()
        
    guard let numberView = self.numberStackView.arrangedSubviews[digitNum-1] as? UILabel else { return }
    if numberView.isHidden == false || numberView.isEqual(self.currencyView) { return }
        
    numberView.text = "\(num)"
    numberView.transform = CGAffineTransform(translationX: 0, y: -40)
        
    UIView.animate(withDuration: self.insertAnimationDuration, delay: 0.0, options: .curveLinear, animations: { [weak self] in
        guard let s = self else { return }
        s.currencyView.isHidden = false
        numberView.isHidden = false
        s.addFloatingPoint()
    }, completion: { [weak self] _ in
        guard let s = self else { return }
        UIView.animate(withDuration: s.insertAnimationDuration, delay: 0.0, options: .curveLinear, animations:{ [weak self] in
            guard let s = self else { return }
            numberView.transform = CGAffineTransform(translationX: 0, y: 0)
            numberView.alpha = 1.0
            s.currencyView.alpha = 1.0
        })
    })
}
```

### 숫자 레이블의 상승 애니메이션 처리

숫자가 삭제될 때 레이블이 상승하며 사라지는 애니메이션이 적용돼야 합니다.

- **자연스러운 효과를 위한 조건**
    1. 상승과 동시에 (마지막 숫자 레이블)-(원 레이블) 사이의 거리가 좁혀져야 합니다.
    2. 상승하며 레이블의 알파 값이 (1.0 → 0.0) 점진적으로 변환되어야 합니다.
    3. 레이블의 transform.x 값의 변화가 없는 것처럼 위로 상승만 해야 합니다.

- **조건 충족 방법**
    - `UIView.animate()`에서 숫자 레이블의 transform과 알파 값 변환, hidden 처리를 동시에 진행

- **트러블 슈팅**

    상승 애니메이션은 한 가지 이슈가 있었습니다.

    숫자 레이블의 transform 값 변환과 스택 뷰에서의 hidden 처리를 동시에 해주다 보니, y 값만 -20으로 세팅했을 때 기대와 다르게 마치 x값이 더해진 것처럼 오른쪽 사선으로 상승하는 효과가 나타났습니다.

```swift
numberView.transform = CGAffineTransform(translationX: 0, y: -20)
```

레이블이 hidden 되면서 스택 뷰에 들어 있는 서브 뷰들의 레이아웃이 조정되는 게 숫자 레이블의 transform 값 변화와 맞물려 일어나는 현상이라고 추측되었습니다.

따라서 transform 값 변환 시 X값에 숫자 레이블의 `-(frame.width / 2)` 값을 주어 위쪽으로만 상승하는 것처럼 보이도록 처리했습니다.

```swift
numberView.transform = (digitNum != 0) ? CGAffineTransform(translationX: -(numberView.frame.width/2), y: -20) : CGAffineTransform(translationX: -(numberView.frame.width), y: -20)
```

- **애니메이션 처리 순서**
    1. `UIView.animate()` 시작
        - 레이블의 transform.x, transform.y 값 변화
        - show → hidden 처리
        - 알파 값 1.0 → 0.0 처리
    2. 숫자 입력 시 처리를 위해 transform 값 0,0 으로 세팅

- **코드**

```swift
private func deleteNumberAnimation() {
    var digitNum = 0
    var currentPrice = self.price
    while(currentPrice > 0) {
        digitNum += 1
        currentPrice /= 10
    }
    
    guard let numberView = self.numberStackView.arrangedSubviews[digitNum] as? UILabel else { return }
        
    UIView.animate(withDuration: self.deleteAnimationDuration, delay: 0.0, options: .curveLinear, animations: { [weak self] in
        guard let s = self else { return }
        numberView.transform = (digitNum != 0) ? CGAffineTransform(translationX: -(numberView.frame.width/2), y: -20) : CGAffineTransform(translationX: -(numberView.frame.width), y: -20)
        numberView.alpha = 0.0
        numberView.isHidden = true
            
        if digitNum == 0 {
            s.currencyView.alpha = 0.0
            s.currencyView.isHidden = true
        }

        s.addFloatingPoint()

    }, completion: { _ in
        numberView.transform = CGAffineTransform(translationX: 0.0, y: 0.0)
    })
}
```

### 쉼표(,) 레이블의 이동 처리

숫자가 입력/삭제될 때마다 뷰에 표기된 금액이 변동되고, 변동된 금액의 세 자리 단위마다 쉼표(,)를 넣어 줘야 합니다.

- **구현 방법**

    쉼표(,) 레이블을 넣는 방법엔 크게 두 가지가 떠올랐습니다.

    1. `init()`에서 최대 금액에 따라 추가될 쉼표(,)들을 미리 스택 뷰에 넣어두고 금액 변동 시마다 show/hidden 시키는 방식
    2. **금액 변동 시마다 스택 뷰에 있는 쉼표(,)를 모두 remove하고, 금액에 맞게 생성해서 다시 insert 시키는 방식**

    처음엔 1안으로 시도했으나, 금액이 변경될 때마다 스택 뷰에서 숫자가 표시될 서브 뷰의 인덱스를 찾는 계산이 복잡하다고 판단되어 2안으로 구현했습니다.

- **로직**
    1. 스택 뷰의 모든 쉼표(,) 레이블을 제거
    2. 현재 금액을 기준으로 스택 뷰에서 숫자가 표시될 레이블을 가져옴

        (쉼표(,) 레이블을 고려하지 않고 현재 금액을 기준으로만 계산하면 되기 때문에 1 안보다 간단)

    3. 상승/하강 애니메이션 처리
    4. 현재 금액을 기준으로 세 자릿수마다 쉼표(,) 레이블 생성 후 insert

```swift
private func addFloatingPoint() {
    if self.price < 1000 { return }
        
    var digitNum = 0
    var currentPrice = self.price
    while(currentPrice > 0) {
        digitNum += 1
        currentPrice /= 10
    }
        
    let floatingPointCount = (digitNum - 1) / 3
    for idx in 1...floatingPointCount {
        let floatingPointIdx = (digitNum) - (idx*3)
        let floatingPointView = UILabel()
        floatingPointView.text = self.floatingPoint
        floatingPointView.font = self.font
        floatingPointView.textColor = (self.isOverMaximum == true) ? self.maximumPricefontColor : self.fontColor
            
        self.numberStackView.insertArrangedSubview(floatingPointView, at: floatingPointIdx)
    }
}
```

이 밖에도 깨알 같은 코드들이 들어가 있지만, 주요 구현은 여기까지 마치겠습니다.

## 👉 [깃허브바로가기](https://github.com/yoosa3004/AmazingPriceView)

# **느낀점**

이 라이브러리는 입사 후 3개월쯤 됐을 때 작업하게 된 프로젝트입니다.

그래서인지 시간이 조금 지난 지금 다시 들여다보니 코드에 아쉬운 부분도 많이 보이는데요.

그래도 지금까지 제가 Swift로 작업한 프로젝트 중 가장 애착이 가고 스택뷰에 관해 많은 걸 배우게 해준 고마운 프로젝트입니다.

(완성하고 너무 뿌듯한 나머지 이름도 `AmazingPriceView`라고 지었습니다)

앞으로도 딜리셔스에서 이 프로젝트처럼 클라이언트 개발자로서 자부심이 생기고 많이 배울 수 있는 UI들을 많이 작업하고 싶습니다!
