# 이미지 업로드 문제 (Mixed Content)

![image.png](image.png)

## Mixed Contents란?

## 문제 분석

HTTPS 사이트([https://www.tio-style.com](https://www.tio-style.com/))에서 HTTP API 엔드포인트([http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com](http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com/))로 요청을 보내려고 해서 브라우저가 차단

## 해결 방법

### 1. ALB에 HTTPS 설정 (권장)

Application Load Balancer에 SSL/TLS 인증서를 설정하여 HTTPS를 지원하도록 해야 합니다:

```bash
# AWS Certificate Manager에서 인증서 요청

aws acm request-certificate \
--domain-name [tio-alb-173623777.ap-northeast-2.elb.amazonaws.com](http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com/) \
--validation-method DNS \
--region ap-northeast-2
```

### 2. 코드에서 API URL 수정

현재 하드코딩된 HTTP URL을 HTTPS로 변경하거나 환경변수로 관리:

```bash
javascript
// 현재
const API_BASE_URL = '[http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com](http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com/)';
// 수정 후
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '[https://api.tio-style.com](https://api.tio-style.com/)';
```

### 3. 임시 해결책 (개발용)

개발 환경에서만 사용할 수 있는 방법:

```bash
// Next.js에서 프록시 설정
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com/api/:path*'
      }
    ]
  }
}

```

가장 좋은 해결책은 ALB에 SSL 인증서를 설정하여 HTTPS를 지원하도록 하는 것. 이렇게 하면 보안도 강화되고 Mixed Content 오류도 해결된다고 하는데..

## 사실은

CloudFront 설정을 보니:

1. CloudFront: HTTPS를 지원하고 SSL 인증서가 있음
2. ALB Origin: "OriginProtocolPolicy": "http-only"로 설정되어 HTTP만 사용
3. API 경로: /api/* 패턴이 ALB로 라우팅됨

하지만 코드에서 직접 ALB URL로 호출하고 있어서 CloudFront를 우회중

```bash
// 현재 (잘못된 방식)
const apiUrl = 'http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com/api/files';

// 수정 후 (올바른 방식)
const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/files`;
// 또는
const apiUrl = 'https://tio-style.com/api/files';
```

### 근데? env.production에는

![image.png](image%201.png)

localhost:3000이 아닌 제대로 된 라우팅 경로가 입력되어있음.

### 실제 원인: Next.js 환경변수 우선순위 문제

코드는 올바르게 작성되어 있었음
• ✅ process.env.NEXT_PUBLIC_API_URL 환경변수 사용
• ✅ .env.production에 [https://tio-style.com](https://tio-style.com/) 설정

• ✅ API 호출 시 baseURL 사용

하지만 브라우저 에러 메시지를 보면 여전히 [http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com로](http://tio-alb-173623777.ap-northeast-2.elb.amazonaws.xn--com-ky7m/) 호출

### Next.js 환경변수 우선순위

1. `.env.production.local` (가장 높음)
2. `.env.local` (**NODE_ENV에 관계없이 항상 로드됨**)
3. `.env.production`
4. `.env`

### 문제의 핵심

.env.local은 모든 환경에서 로드되기 때문에:
• 개발용 NEXT_PUBLIC_API_URL=http://localhost:8080이 설정되어 있음
• 프로덕션 빌드에서도 이 값이 우선적으로 사용됨
• .env.production의 [https://tio-style.com](https://tio-style.com/) 설정이 무시됨

+ `deploy.yml` 에도 직접적인 ALB 주소가 사용되고 있었음.

```bash
.github/workflows/deploy.yml: NEXT_PUBLIC_API_URL: http://TI... => NEXT_PUBLIC_API_URL: https://w... ←                              │
 │                                                                                                                                             │
 │ 36                                                                                                                                          │
 │ 37     - name: Build Next.js application                                                                                                    │
 │ 38       env:                                                                                                                               │
 │ 39   -     NEXT_PUBLIC_API_URL: http://TIO-ALB-173623777.ap-northeast-2.elb.amazonaws.com                                                   │
 │ 39   +     NEXT_PUBLIC_API_URL: https://www.tio-style.com                                                                                   │
 │ 40         NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${{ secrets.NEXT_PUBLIC_GOOGLE_CLIENT_ID }}                                                        │
 │ 41         NODE_ENV: production                                                                                                             │
 │ 42       run: |            
```

### 해결 과정

1. 환경별 파일 분리:
• `.env.development` → 개발환경 전용 (localhost:8080)
• `.env.production` → 프로덕션 전용 ([https://tio-style.com](https://tio-style.com/))
• `.env.local` → 공통 설정만 (API URL 제외, OAuth 설정만 유지)
2. 빌드 결과 확인:
• 수정 전: localhost:8080 24개 포함
• 수정 후: localhost:8080 3개로 감소, [tio-style.com](http://tio-style.com/) 21개로 증가

### 최종 해결책

```bash
올바른 환경변수 구조:
.env.local          # 공통 설정 (OAuth 등)
.env.development    # 개발: localhost:8080
.env.production     # 프로덕션: [https://tio-style.com](https://tio-style.com/)
```