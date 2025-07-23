# 프론트엔드 트러블슈팅: 404 Not Found, X-Powered-By: Next.js, 이미지 최적화, ALB 라우팅

## 🚨 문제 상황 개요

CSS와 HTML `404 not found` 문제를 해결하고 나서 마주한 것은 텅 빈 이미지들과 API 404 오류의 연속이었다. 

![image.png](image.png)

![image.png](image%201.png)

![image.png](image%202.png)

![image.png](image%203.png)

하나의 문제를 해결하면 다른 문제가 연쇄적으로 발생하는 전형적인 인프라 트러블슈팅 상황이었다.

## 🖼️ 1단계: 이미지 로드 실패 문제

### 문제 발견
이미 일전에 한번 겪었던 이슈인데, 원인 자체는 `Next.js의 이미지 최적화 기능`에 있었다. 전에는 임시방편으로 `next.config.ts`에서 이미지 최적화를 꺼놓고 작업을 했는데, 켜놓은 탓에 발생한 것으로 보인다.

```typescript
const nextConfig: NextConfig = {
    images: {
        unoptimized: true // 이 부분이 true로 되어있으면 최적화를 끄는것이다.
    }
}
```

### 문제 원인 분석

Next.js의 이미지 최적화는 애플리케이션이 돌아가는 서버에서 이미지를 받아 최적화를 진행해 준 후 유저의 클라이언트로 반환해줘야 하는데, 기존의 S3 기반 정적페이지에서는 애초에 최적화를 해 줄 애플리케이션이 없었기 때문에 비활성화를 해두었던 것이고 그 설정이 지금까지 남아서 문제가 발생한 것이다.

#### 기존 흐름 (S3 정적 호스팅)
```
브라우저 → CloudFront → S3 → S3 링크 이미지 반환
```

#### 현재 흐름 (EC2 + Next.js)
```
브라우저 → CloudFront → ALB → EC2 (Next.js) - 이미지 처리시도(안들어옴) → 400 Bad Request
                                              → S3 이미지링크 
```

### S3의 한계점

S3는 단순 파일 저장소이므로:
- 이미지 리사이징 불가능
- 포맷 변환 불가능
- 동적 처리 불가능
- `/_next/image` API 엔드포인트 존재하지 않음

### Next.js가 이미지를 찾는 순서

1. **로컬 public 폴더**: `/var/www/tryiton-frontend/public/images/dummy/ex10.png`
2. **원격 이미지**: `next.config.ts`의 `remotePatterns` 설정 확인
3. **찾지 못하면**: `400 Bad Request`

### 해결책 1: CloudFront 동작 수정

AWS 콘솔에서:
1. CloudFront → Distribution EOOGBPUYRN1V5
2. Behaviors 탭
3. `/_next/image/*` 선택 → Edit
4. Origin and origin groups 변경:
   - **현재**: `tio-frontend-assets-jungle8th.s3.ap-northeast-2.amazonaws.com`
   - **변경**: `tio-alb-173623777.ap-northeast-2.elb.amazonaws.com`
5. Save changes

#### 수정 후 처리 흐름
```
브라우저 → CloudFront → ALB → EC2 (Next.js 서버)
                              ↓
                        이미지 최적화 처리
                              ↓
                        최적화된 이미지 반환
```

### 해결책 2: 이미지 파일 위치 문제 해결

#### 현재 상황
- **EC2**: `/public/images/` → 파일 없음 ❌
- **S3**: `tio-image-storage-jungle8th` → 실제 이미지들 존재 ✅

#### 설계 의도 vs 실제 구현

**설계 의도:**
- **정적 파일**: `tio-frontend-assets-jungle8th` (CSS, JS)
- **이미지 파일**: `tio-image-storage-jungle8th` (업로드된 이미지)
- **로컬 이미지**: `/public/images/` (아이콘, 로고 등)

**실제 문제:**
1. 로컬 이미지들(`/images/common/avatar.svg`)이 CloudFront에서 S3로 라우팅됨
2. S3에는 `images/` 폴더가 없음 (업로드된 제품 이미지만 `products/`에 존재)
3. Next.js Image Optimization도 S3에 없는 이미지를 처리하려 해서 400 에러

#### 이미지 파일들을 EC2로 복사

```bash
# EC2 서버에서 실행
cd /var/www/tryiton-frontend

# public/images 디렉토리 생성
mkdir -p public/images/dummy
mkdir -p public/images/common

# S3에서 이미지 파일들 다운로드
aws s3 cp s3://tio-frontend-assets-jungle8th/images/ --recursive
```

#### CloudFront에서 이미지 라우팅 추가

AWS 콘솔에서:
1. CloudFront → Behaviors
2. Create behavior
3. Path pattern: `/images/*`
4. Origin: `tio-frontend-assets-jungle8th.s3.ap-northeast-2.amazonaws.com`
5. Save

## 🔗 2단계: API 404 오류 문제 (연쇄 발생)

### 문제 발견

이미지 문제를 해결하고 나니 이번엔 백엔드에서 처리가 안 된다.

![image.png](image%204.png)

웹사이트에 들어가니 이런 에러들이 쏟아지고 있었다:

```
/api/home/products:1 → 404 Not Found
/api/avatars/latest-info:1 → 404 Not Found
```

분명히 Spring Boot 서버는 살아있고, CloudFront에서 `/api/*` 요청을 ALB로 보내도록 설정해놨는데 왜 404가 뜨는 거지?

### 문제 원인 파악

#### ALB 직접 테스트

일단 ALB에 직접 API 요청을 날려봤다.

```bash
curl -I http://TIO-ALB-173623777.ap-northeast-2.elb.amazonaws.com/api/home/products
```

**결과:**
```
HTTP/1.1 404 Not Found
X-Powered-By: Next.js  ← 어? 이거 왜 Next.js야?
```

어라? API 요청인데 Next.js에서 응답이 오고 있네?

#### ALB 라우팅 규칙 분석

ALB 리스너 규칙을 확인해봤더니...

```json
{
    "Priority": "50",
    "Conditions": [{"Field": "path-pattern", "Values": ["/*"]}],
    "Actions": [{"TargetGroupArn": "TargetGroup-Frontend-SSR"}]
}
```

아 이거구나! `/*` 패턴이 모든 요청을 Next.js 서버로 보내고 있었다. `/api/*` 요청도 예외 없이 말이다.

### 통신 흐름 분석

#### 문제가 있던 흐름

```
브라우저 → CloudFront → ALB → 어디로 갈까?
```

ALB에서 라우팅 규칙을 확인하는 순서:
1. **Priority 50**: `/*` → Next.js 서버 ✅ (매칭됨!)
2. **Default**: Spring Boot 서버 (도달 안 함)

```
결과적으로:
브라우저 → CloudFront → ALB → Next.js 서버
                              ↓
                        404 Not Found
                        (Next.js에는 /api 라우트가 없으니까)
```

#### 왜 이런 일이 생겼을까?

ALB는 우선순위 순서대로 규칙을 확인한다:

1. Priority 50의 `/*` 패턴을 먼저 본다
2. `/api/home/products`가 `/*`에 매칭된다 (당연히 매칭되지)
3. Next.js 서버로 요청을 보낸다
4. Next.js: "어? 나한테 `/api/home/products` 라우트 없는데?" → 404

Default 규칙까지 갈 일이 없었던 거다.

### 해결 과정

#### 1단계: 문제 파악
```bash
curl -I http://ALB주소/api/home/products
X-Powered-By: Next.js ← 이거 보고 "아 잘못됐구나" 깨달음
```

#### 2단계: ALB 규칙 추가
```bash
aws elbv2 create-rule \
  --listener-arn "리스너ARN" \
  --priority 40 \
  --conditions Field=path-pattern,PathPatternConfig='{Values=["/api/*"]}' \
  --actions Type=forward,TargetGroupArn="Spring-Boot-타겟그룹ARN"
```

#### 3단계: 새로운 라우팅 구조
- **Priority 40**: `/api/*` → Spring Boot 서버 ✅ (새로 추가)
- **Priority 50**: `/*` → Next.js 서버
- **Default**: Spring Boot 서버

### 해결 후 통신 흐름

```
브라우저 → CloudFront → ALB → 어디로 갈까?
```

ALB에서 라우팅 규칙 확인:
1. **Priority 40**: `/api/*` → `/api/home/products` 매칭! → Spring Boot 서버 ✅
2. **Priority 50**: `/*` (도달 안 함)

```
결과:
브라우저 → CloudFront → ALB → Spring Boot 서버
                              ↓
                        401 Unauthorized
                        (인증이 필요하다는 정상적인 API 응답!)
```

## 🧪 테스트 결과

```bash
curl -I http://ALB주소/api/home/products
```

**Before:**
```
HTTP/1.1 404 Not Found
X-Powered-By: Next.js
```

**After:**
```
HTTP/1.1 401 Unauthorized
Content-Type: application/json;charset=UTF-8
```

`X-Powered-By: Next.js` 헤더가 사라지고, Spring Boot의 JSON 응답이 오기 시작했다!

## 💡 핵심 포인트 및 교훈

### 1. Next.js 이미지 최적화의 이해
- **서버 사이드 처리 필요**: 이미지 최적화는 런타임에 서버에서 처리됨
- **S3 정적 호스팅과 호환 불가**: 동적 처리가 불가능한 S3에서는 작동하지 않음
- **CloudFront 라우팅 중요**: `/_next/image/*` 요청을 올바른 서버로 라우팅해야 함

### 2. ALB 라우팅 규칙의 중요성
- **숫자가 낮을수록 높은 우선순위**
- **매칭되면 그 즉시 해당 타겟으로 라우팅**
- **나머지 규칙은 확인하지 않음**

### 3. 와일드카드 패턴 주의사항

**✅ 올바른 순서:**
- Priority 40: `/api/*` → Backend
- Priority 50: `/*` → Frontend

**❌ 잘못된 순서:**
- Priority 40: `/*` → Frontend
- Priority 50: `/api/*` → Backend (도달 불가)

### 4. 마이크로서비스 아키텍처에서의 라우팅

```
현재 아키텍처:
Internet → CloudFront → ALB → Next.js (Frontend)
                            → Spring Boot (Backend API)
                            → S3 (Static Assets)
```

각 서비스의 역할을 명확히 구분하고, 라우팅 규칙을 정확히 설정하는 것이 중요하다.

## 🎯 최종 해결 상태

### ✅ 이미지 로딩 성공
- Next.js 이미지 최적화 활성화
- `/_next/image/*` 요청이 EC2로 올바르게 라우팅
- 로컬 이미지 파일들이 EC2에 정상 배치

### ✅ API 통신 성공
- `/api/*` 요청이 Spring Boot 서버로 올바르게 라우팅
- `X-Powered-By: Next.js` 헤더 제거
- 정상적인 API 응답 (401 Unauthorized 등)

### ✅ 전체 시스템 안정화
- 프론트엔드: Next.js 서버에서 SSR 처리
- 백엔드 API: Spring Boot 서버에서 처리
- 정적 파일: S3에서 CDN을 통해 제공
- 이미지 최적화: Next.js 서버에서 동적 처리

## 📝 향후 개선 사항

1. **모니터링 강화**: CloudWatch를 통한 ALB 라우팅 메트릭 추적
2. **이미지 최적화 성능 튜닝**: Next.js 이미지 최적화 설정 세부 조정
3. **캐싱 전략 개선**: CloudFront 캐싱 정책 최적화
4. **에러 핸들링**: 404, 500 에러에 대한 커스텀 페이지 구성

---

*"모든 요청을 프론트엔드로 보내자!"라고 생각해서 `/*` 규칙을 만들었는데, 이게 API 요청까지 가로채버린 케이스였다. 하나의 문제를 해결하면 연쇄적으로 다른 문제가 발생하는 것이 인프라 트러블슈팅의 묘미(?)인 것 같다. 이제 이미지도 정상적으로 로드되고, API도 Spring Boot 서버로 잘 간다.*
