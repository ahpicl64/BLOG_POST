# 이미지 최적화 기법 적용 (WebP 포매팅, CloudFront Function, Lazy Loading)

## **1️⃣ 이미지 최적화 문제 (핵심 원인)**

문제점:
• **이미지 크기 편차가 매우 큼**: 18KB ~ 1.5MB (최대 83배 차이!)
• **PNG 파일이 특히 큼**: products/10011/img3.png = 1.5MB
• **JPG도 일부 과도하게 큼**: products/10000/img2.jpg = 308KB
• **최적화되지 않은 원본 이미지 직접 사용**

성능 영향:
• 고사양 데스크톱: 빠른 CPU/GPU로 대용량 이미지 처리 가능
• 맥북 Air M1: 상대적으로 제한된 리소스로 느린 렌더링

## **2️⃣ CloudFront 설정 문제**

현재 상태:
• CloudFront는 구성되어 있음 ✅
• 이미지 경로 /results/*는 S3로 직접 연결 ✅
• **하지만 이미지 최적화 기능 미적용** ❌

문제점:
• 원본 이미지 그대로 전송
• 기기별 반응형 이미지 미제공
• 이미지 압축/포맷 변환 없음

## **3️⃣ 아키텍처 현황**

실제 운영 중인 리소스 (ap-northeast-2):
• **EC2 인스턴스**: 9개 (다양한 서비스별)

• Node.js 서버: t2.micro (2개)

• Spring 서버: t3.medium (2개)

• Python 서버: t3.micro, g5.xlarge (2개)

• Frontend SSR: t2.medium (2개)

• **RDS**: MySQL 8.0 (db.t4g.medium)

• **CloudFront**: 완전 구성됨

• **S3**: 4개 버킷 (이미지, 프론트엔드, CI/CD, 로그)

## **4️⃣ 네트워크 성능**

측정 결과:

- 직접 도메인: 215ms
    
    ```bash
    curl -o /dev/null -s -w "DNS: %{time_namelookup}s 
    \ | Connect: %{time_connect}s 
    \ | SSL: %{time_appconnect}s 
    \ | Transfer: %{time_starttransfer}s 
    \ | Total: %{time_total}s 
    \ | Size: %{size_download} bytes\n" https://tio-style.com
    ```
    
    DNS: 0.137615s | Connect: 0.148853s | SSL: 0.168402s | Transfer: 0.214906s | Total: 0.215491s | Size: 14936 bytes
    
- CloudFront: 121ms (44% 빠름)
    
    ```bash
    curl -o /dev/null -s -w "DNS: %{time_namelookup}s | Connect: %{time_connect}s | SSL: %{time_appconnect}s | Transfer: %{time_starttransfer}s | Total: %{time_total}s | Size: %{size_download} bytes\n" https://d1vke19yqieoiy.cloudfront.net
    ```
    
    DNS: 0.026091s | Connect: 0.041567s | SSL: 0.071407s | Transfer: 0.120812s | Total: 0.121538s | Size: 14936 bytes
    
- CloudFront는 정상 작동 중

## 🎯 A. 이미지 최적화 (가장 중요)

### **현재 문제 상황**

- 1.5MB PNG 파일들이 맥북에서 렌더링 병목 발생
- 300KB+ JPG 파일들이 네트워크 대역폭 소모
- 원본 해상도 그대로 모든 기기에 전송

### **해결 방법들**

A-1: 업로드 시점 최적화

- **구현 방식**: S3 업로드 전 이미지 처리 파이프라인 구축
- **기술 스택**: Sharp.js (Node.js) 또는 Pillow (Python) 사용
- **최적화 설정**:
• JPG: 80% 품질, Progressive 인코딩
• PNG: TinyPNG API 또는 pngquant 압축
• WebP: 75% 품질로 변환 (90% 용량 절약)
- **예상 결과**: 평균 파일 크기 70-80% 감소

A-2: 다중 해상도 생성

- **구현 방식**: 업로드 시 여러 크기 자동 생성
- **해상도 세트**:
• 썸네일: 150x150px
• 모바일: 480px width
• 태블릿: 768px width
• 데스크톱: 1200px width
- **파일명 규칙**: img1_480.jpg, img1_768.jpg
- **예상 결과**: 기기별 최적 용량 전송

A-3: 포맷 현대화

- **WebP 변환**: 기존 JPG/PNG → WebP (90% 용량 절약)
- **AVIF 지원**: 최신 브라우저용 (WebP보다 20% 더 작음)
- **Fallback 전략**: WebP → JPG 순서로 브라우저 지원 확인
- **예상 결과**: 최신 기기에서 극적인 성능 향상

## 🚀 B. CloudFront 이미지 최적화 활성화

### **현재 CloudFront 상태**

- 기본 캐싱만 적용됨
- 원본 이미지 그대로 전송
- 실시간 최적화 기능 미사용

### **해결 방법들**

B-1: Lambda@Edge 이미지 리사이징

- **구현 위치**: CloudFront Origin Response
- **동작 방식**:

요청: /products/10000/img1.jpg?w=480&q=80
처리: Lambda가 실시간으로 480px 폭, 80% 품질로 변환
캐싱: 변환된 이미지를 CloudFront에 캐시

- **코드 예시**:

```jsx
javascript
  const sharp = require('sharp');

  exports.handler = async (event) => {
    const { width, quality } = event.Records[0].cf.request.querystring;
    const image = await sharp(originalImage)
      .resize(parseInt(width))
      .jpeg({ quality: parseInt(quality) })
      .toBuffer();
    return image;
  };
```

- **예상 결과**: 요청 시점에 최적 크기 제공

B-2: CloudFront Functions 활용

- **구현 위치**: Viewer Request 단계
- **동작 방식**: User-Agent 기반 자동 리다이렉션

```jsx

javascript
  function handler(event) {
    var request = event.request;
    var headers = request.headers;
    var userAgent = headers['user-agent'].value;

    if (userAgent.includes('Mobile')) {
      request.uri = request.uri.replace('.jpg', '_mobile.jpg');
    }
    return request;
  }
```

- **예상 결과**: 기기별 자동 최적화

B-3: 이미지 최적화 서비스 연동

- **AWS 서비스**: CloudFront + S3 + Lambda
- **서드파티**: Cloudinary, ImageKit 연동
- **구현 방식**:

원본: [https://tio-style.com/products/10000/img1.jpg](https://tio-style.com/products/10000/img1.jpg)
최적화: [https://res.cloudinary.com/tio/image/fetch/w_480,q_auto,f_auto/https://s3.../img1.jpg](https://res.cloudinary.com/tio/image/fetch/w_480,q_auto,f_auto/https://s3.../img1.jpg)

- **예상 결과**: 전문 이미지 CDN의 고급 최적화 기능 활용

## ⚡ C. Lazy Loading 구현

### **현재 로딩 방식 문제**

- 페이지 로드 시 모든 이미지 동시 요청
- 화면에 보이지 않는 이미지도 미리 로드
- 초기 로딩 시간 증가 및 대역폭 낭비

### **해결 방법들**

C-1: Intersection Observer API

- **구현 방식**: 브라우저 네이티브 API 사용
- **코드 예시**:

```jsx

javascript
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src; // data-src → src
        img.classList.remove('lazy');
        observer.unobserve(img);
      }
    });
  });

  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
```

- **HTML 구조**:

```html

html
  <img data-src="/products/10000/img1.jpg"
       src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E"
       class="lazy" alt="상품 이미지">
```

- **예상 결과**: 스크롤 시점에 이미지 로드

C-2: Progressive Loading
• **구현 방식**: 저화질 → 고화질 순차 로딩
• **단계별 로딩**:

1. 초기: 10KB 블러 이미지 표시
2. 로딩 중: CSS blur 효과 적용
3. 완료: 원본 이미지로 교체 + blur 제거
• **코드 예시**:

```css
css
.image-container {
position: relative;
}
.image-placeholder {
filter: blur(5px);
transition: filter 0.3s;
}
.image-loaded {
filter: blur(0);
}
```

- **예상 결과**: 사용자 체감 로딩 속도 향상

C-3: Virtual Scrolling (고급)

- **구현 방식**: 화면에 보이는 이미지만 DOM에 유지
- **라이브러리**: react-window, vue-virtual-scroller
- **동작 원리**:

전체 상품: 1000개
DOM 유지: 화면 ±5개 = 약 15개만
스크롤 시: 동적으로 DOM 추가/제거

- **예상 결과**: 대량 상품 페이지에서 메모리 사용량 90% 절약

## 📊 구현 우선순위 및 효과 예측

### **1순위: 이미지 최적화 (A)**

- **구현 난이도**: 중간
• **예상 효과**: 로딩 시간 60-80% 단축
• **적용 범위**: 모든 사용자
• **투자 대비 효과**: 최고

### **2순위: Lazy Loading (C)**

- **구현 난이도**: 쉬움
• **예상 효과**: 초기 로딩 50% 단축
• **적용 범위**: 모든 사용자
• **투자 대비 효과**: 높음

### **3순위: CloudFront 최적화 (B)**

- **구현 난이도**: 높음
• **예상 효과**: 추가 20-30% 성능 향상
• **적용 범위**: 고급 최적화
• **투자 대비 효과**: 중간