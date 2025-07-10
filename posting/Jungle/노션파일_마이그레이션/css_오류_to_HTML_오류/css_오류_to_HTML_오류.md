# css 오류 → HTML 오류

## 현상

CSS 파일을 전혀 인식하지 못하는 듯한 모습

![image.png](image.png)

## 분석

![image.png](image%201.png)

![image.png](image%202.png)

## 시도 (수동으로 빌드해보기)

![image.png](image%203.png)

EC2 내부에서 git pull 받아와 수동으로 npm build 수행함

![image.png](image%204.png)

## 원인

![image.png](image%205.png)

`globals.css` 파일의 `@import` 문 형식 오류.

Tailwind CSS의 버전이 3.x → 4.0으로 올라가면서, build를 위한 import문이 저렇게 구분해서 정리하는게 아닌 `@tailwindcss` 이렇게 하나만 적어주면 된다고 한다.

수정하고 빌드했을 때,

![image.png](image%206.png)

0바이트 짜리의 CSS 파일은 사라지고, 정상 배포되는 모습을 확인했다.

CloudFront의 캐싱도 무효화 처리해준다

![image.png](image%207.png)

## 아직도

![image.png](image%208.png)

실제로 있는 CSS 파일은 **`6273f2f26c30c4e1.css`**, **`ed4700d621702d51.css`** 두 파일 이나, 아직도 서버에서는 **`0f6b13800efcb7a3.css`**  파일을 찾아 불일치 하는 모습을 볼 수 있다. 

EC2 내부를 확인해보면?

![image.png](image%209.png)

S3 버킷의 정적 배포파일과 동일한 CSS 파일을 가지고있다.

근데 왜 우리의 사이트에서는 아직도 처음부터 지금까지 줄곧 **`0f6b13800efcb7a3.css` 이 파일만 찾는거지?**

### 예상 원인

HTML 파일이 캐시되어 있어 오래된 CSS를 계속 참조

- CloudFront 또 무효화

![image.png](image%2010.png)

- EC2 HTML 파일 확인

```bash

# 실제 HTML에서 어떤 CSS를 참조하는지 확인
cd /var/www/tryiton-frontend
find .next -name "*.html" -exec grep -l "0f6b13800efcb7a3.css" {} \;

# 또는 빌드 매니페스트 확인
cat .next/build-manifest.json | grep css

```

![image.png](image%2011.png)

아무것도 안뜬다

- pm2 완전 재시작

```bash

# PM2 프로세스 완전 재시작
pm2 delete tryiton-frontend
pm2 start ecosystem.config.js
```

![image.png](image%2012.png)

- 브라우저 캐시 삭제
    - **개발자 도구** → Application → Clear storage → Clear site data
    - **시크릿 모드**에서 접속 테스트
        
        ![image.png](image%2013.png)
        

시크릿 모드까지 했는데, 여전히 **`0f6b13800efcb7a3.css` 찾는다**

## 추가 확인 방법

### 1. Next.js 서버 사이드에서 HTML 생성 확인

```bash
cd /var/www/tryiton-frontend
# 실제 서버에서 생성되는 HTML 확인

curl -s http://localhost:3000/ | grep -o '_next/static/css/[^"]*'

# 또는 특정 페이지 확인

curl -s http://localhost:3000/detail/5 | grep -o '_next/static/css/[^"]*'
```

![image.png](image%2014.png)

### 2. 빌드 매니페스트 전체 내용 확인

```bash
# 빌드 매니페스트 전체 내용 출력

cat .next/build-manifest.json

# app-build-manifest도 확인

cat .next/app-build-manifest.json | grep -i css
```

![image.png](image%2015.png)

![image.png](image%2016.png)

### 3. 환경 변수 확인

```bash
# 환경 변수에 하드코딩된 CSS 파일명이 있는지 확인

env | grep css
cat .env*
```

![image.png](image%2017.png)

### 4. Next.js 설정 파일 확인

```bash
# next.config.ts에서 CSS 관련 설정 확인

cat next.config.ts | grep -A 10 -B 10 css
```

없음

### 5. 소스 코드에서 하드코딩 확인

```bash
# 소스 코드에서 해당 CSS 파일명이 하드코딩되어 있는지 확인

grep -r "0f6b13800efcb7a3.css" src/
grep -r "0f6b13800efcb7a3" .
```

없음

### 6. 다른 빌드 파일들 확인

```bash
# 다른 매니페스트 파일들도 확인

find .next -name "*.json" -exec grep -l "0f6b13800efcb7a3" {} \;
```

없음

### 종합 → CloudFront 문제?

1. EC2 서버에서 생성되는 HTML: 6273f2f26c30c4e1.css ✅ (올바름)
2. app-build-manifest.json: 올바른 CSS 파일들 포함 ✅
3. 하드코딩된 파일명: 어디에도 0f6b13800efcb7a3.css 없음 ✅
4. 브라우저에서는 여전히: 0f6b13800efcb7a3.css 요청 ❌

### 1. CloudFront 캐시 상태 확인

AWS 콘솔에서:
• CloudFront → Distribution → Monitoring 탭
• **Cache statistics** 확인
• 무효화가 실제로 완료되었는지 확인

### 2. CloudFront 동작 설정 확인

Behaviors 탭에서:
**Default (*)** 동작 확인

**Cache Policy**: 너무 긴 TTL 설정되어 있는지 확인

**Origin Request Policy** 확인

![image.png](image%2018.png)

### 3. 강제 캐시 우회 테스트

```bash
# CloudFront를 우회해서 직접 EC2 접근 (가능하다면)

curl -s http://[EC2-IP]:3000/ | grep -o '_next/static/css/[^"]*'
```

### 4. CloudFront 설정 임시 변경

Cache Policy를 임시로 변경:

- **TTL을 0으로 설정** (캐시 비활성화)
- 문제 해결 후 다시 원복

는 안해도되는게 캐시 정책이 `CachingDisabled` 로, 이미 정책보기해서 들어가보면, TTL이 0이다.

![image.png](image%2019.png)

### 5. 다른 무효화 패턴 시도

```bash
더 구체적인 무효화:
• /
• /detail/*
• /*.html
```

![image.png](image%2020.png)

![image.png](image%2021.png)

### 브라우저에서 실제 요청 확인

개발자 도구 → Network 탭에서:
**Response Headers** 확인:

![image.png](image%2022.png)

server: AmazonS3 또는 다른 값

x-cache: Miss from cloudfront (캐시 비활성화 확인)

![image.png](image%2023.png)

어 찾았나?

**Request Headers** 확인

![image.png](image%2024.png)

### 모바일에서도 확인해보기

![image.png](image%2025.png)

여전히 같기때문에, 내 환경에서만 발생하는 `로컬 캐시` 문제는 아니고. CloudFront나 서버 설정 문제로 보아야겠다.

## CloudFront Error 원인 분석

### 1. Origin 접근 문제

- CloudFront가 S3 Origin에 접근할 수 없음
- S3 버킷 권한 문제
- Origin Access Control (OAC) 설정 문제

### 2. CloudFront 설정 확인 필요

AWS 콘솔에서 확인:

A. Origins 설정:

S3 Origin이 올바르게 설정되어 있는지

Origin Access Control 설정 상태

B. Behaviors 설정:

Path pattern이 /_next/static/*에 대해 올바른 Origin을 가리키는지

여러 Origin이 있다면 올바른 Origin으로 라우팅되는지

### 3. CloudFront 로그 확인

CloudFront 콘솔에서:

- **Monitoring** 탭 → CloudFront access logs 활성화
- 실제 에러 로그 확인

### 4. 임시 해결책 - assetPrefix 제거

next.config.ts에서:

```bash
const nextConfig: NextConfig = {
  // assetPrefix 주석 처리하여 EC2에서 직접 제공
  // assetPrefix: process.env.NODE_ENV === 'production'
  //     ? 'https://tio-frontend-assets-jungle8th.s3.ap-northeast-2.amazonaws.com'
  //     : '',
};
```

이렇게 하면 CSS 파일을 S3가 아닌 EC2에서 직접 제공하게 됩니다.

### 5. CloudFront Distribution 상태 확인

General 탭에서:
• Distribution Status가 Deployed인지 확인
• Last modified 시간 확인

## 예상원인

1. /_next/static/* 경로의 캐시 정책이 `CachingOptimized`로 설정되어 `24시간 캐시`됨
2. CloudFront Function이 모든 요청을 가로채서 URL을 변경하고 있을 가능성
3. Default Behavior도 S3 Origin을 가리키고 있어서 HTML 요청이 잘못 라우팅될 수 있음

### CloudFront 캐싱 정책 문제

초기에 `globals.css` 수정으로 배포되는 CSS 파일 자체를 고쳐도 예전 파일을 참조한다는 것은 정책 문제일 확률이 높음. 확인해보니 static 파일에 대한 정책이 `CachingOptimized` 로 되어있음. 

![image.png](image%2026.png)

이것도 `CachingDisabled` 로 변경해준다

### Default Behavior Origin 문제?

전체 행동 설정에서 

![image.png](image%2027.png)

Default Behavior가 S3를 가리켜 HTML 요청이 잘못 라우팅될 수 있음.

모든 요청이 S3로 가기 때문에, ALB로 변경해주어서 Html은 EC2에서, 정적 파일은 S3에서 참조하도록 변경

![image.png](image%2028.png)

### URL 리 라이트 function 해제

### 현재 구조 (문제 있음)

```bash
브라우저 → CloudFront → S3 (HTML 파일)
											↓
CloudFront Function (URL 리라이트)
											↓
오래된 HTML 파일 (0f6b13800efcb7a3.css 참조)
```

### 문제점

1. S3의 HTML 파일이 오래된 빌드 해시를 가지고 있음
2. CloudFront Function이 URL을 리라이트하지만, 여전히 S3의 오래된 HTML을 제공
3. S3 HTML ≠ EC2 빌드 결과

## ALB 변경 후 해결 과정

### 새로운 구조 (해결됨)

```bash
브라우저 → CloudFront → ALB → EC2 (Next.js 서버)
													↓
							실시간 HTML 생성 (최신 CSS 파일명)
```

### 해결되는 이유

1. EC2의 Next.js 서버가 실시간으로 HTML을 생성
2. 최신 빌드 매니페스트를 기반으로 올바른 CSS 파일명 포함
3. S3의 오래된 HTML 파일 무시

## 실제 확인

앞서 확인했듯이:

```bash
bash
curl -s [http://localhost:3000/](http://localhost:3000/) | grep -o '_next/static/css/[^"]*'
# 결과: 6273f2f26c30c4e1.css (올바른 파일명)

EC2에서는 이미 올바른 CSS 파일명을 제공하고 있음
```

## 정적 파일 처리

```bash
CSS/JS 요청 → CloudFront → /_next/static/* → S3
HTML 요청   → CloudFront → Default (*)     → ALB → EC2
```

- **정적 파일**: S3에서 제공 (빠름)
- **HTML**: EC2에서 실시간 생성 (최신 정보)

## 결론

ALB로 변경하면 EC2의 Next.js 서버가 최신 빌드 정보로 HTML을 생성하기 때문에, 올바른 CSS 파일명이 포함된 HTML이 브라우저에 전달되어 이것이 근본적인 해결책이라고 한다

### 해제하기

![image.png](image%2029.png)

![image.png](image%2030.png)

## 또 다른 문제 발생

CSS는 인식을 하는데 HTML 페이지를 못찾는 것 같다

![image.png](image%2031.png)

![image.png](image%2032.png)

![image.png](image%2033.png)

CloudFront 직접 도메인에서도 동일한 404 에러가 발생한다면, ALB 자체에 문제가 있을 가능성이 높다고한다.

## 추가 디버깅

### EC2에서 로컬 Next.js 서버 확인

```bash
# EC2 서버에서 로컬 테스트

curl -I http://localhost:3000/
curl -v http://localhost:3000/
```

![image.png](image%2034.png)

### PM2 프로세스 상태 확인

```bash
# PM2 상태 확인

pm2 list
pm2 logs tryiton-frontend --lines 50
```

![image.png](image%2035.png)

### Next.js 서버 포트 확인

```bash
# 3000 포트에서 실행 중인지 확인

netstat -tlnp | grep :3000
ss -tlnp | grep :3000
```

![image.png](image%2036.png)

## 현재 상황 분석

✅ Next.js 서버: 3000 포트에서 정상 실행 중
✅ 로컬 접근: curl [http://localhost:3000/](http://localhost:3000/) → 200 OK
❌ CloudFront 접근: 404 Not Found

## 문제 원인: HTTPS vs HTTP

- **ALB 테스트**: http:// (HTTP) → 200 OK ✅
- **CloudFront**: https:// (HTTPS) → 404 Not Found ❌

CloudFront가 ALB에 HTTPS로 요청을 보내고 있지만, ALB는 HTTP만 지원하고 있습니다.

### CloudFront에서 HTTPS로 ALB 접근 테스트 `실패`

```bash
# HTTPS로 ALB 접근 테스트

curl -v [https://TIO-ALB-173623777.ap-northeast-2.elb.amazonaws.com/](https://tio-alb-173623777.ap-northeast-2.elb.amazonaws.com/)
```

![image.png](image%2037.png)

## 해결 방법

CloudFront Origin 설정을 다시 확인하고 수정:

AWS 콘솔에서:

1. CloudFront → Distribution EOOGBPUYRN1V5
2. Origins 탭
3. ALB Origin 선택 → Edit
4. Protocol 설정 확인:
• **HTTPS Only** → HTTP Only로 변경
• **Origin Protocol Policy**: HTTP Only 확인

![image.png](image%2038.png)

### ??? 사실 되어있었음.

근데 CLI를 통해 확인해보니 HTTPS 포트인 `443` 포트도 적용되어있엇음. 콘솔로는 수정 / 확인이 어려워서 cli로 `/tmp/cloudfront-config.json` 파일을 수정해서 조치함

```json
 {
   "CallerReference": "00d07047-dc5b-4c38-945c-dc0d8ce8aabf",
   "Aliases": {
     "Quantity": 2,
     "Items": [
       "www.tio-style.com",
       "tio-style.com"
     ]
   },
   "DefaultRootObject": "index.html",
   "Origins": {
     "Quantity": 2,
     "Items": [
       {
         "Id": "tio-frontend-assets-jungle8th.s3.ap-northeast-2.amazonaws.com",
         "DomainName": "tio-frontend-assets-jungle8th.s3.ap-northeast-2.amazonaws.com",
         "OriginPath": "",
         "CustomHeaders": {
           "Quantity": 0
         },
         "S3OriginConfig": {
           "OriginAccessIdentity": ""
         },
         "ConnectionAttempts": 3,
         "ConnectionTimeout": 10,
         "OriginShield": {
           "Enabled": false
         },
         "OriginAccessControlId": "ESHQ21WXTV2D2"
       },
       {
         "Id": "tio-alb-173623777.ap-northeast-2.elb.amazonaws.com",
         "DomainName": "tio-alb-173623777.ap-northeast-2.elb.amazonaws.com",
         "OriginPath": "",
         "CustomHeaders": {
           "Quantity": 0
         },
         "CustomOriginConfig": {
           "HTTPPort": 80,
           "HTTPSPort": 80,
           "OriginProtocolPolicy": "http-only",
           "OriginSslProtocols": {
             "Quantity": 1,
             "Items": [
               "TLSv1.2"
             ]
           },
           "OriginReadTimeout": 30,
           "OriginKeepaliveTimeout": 5
         },
         "ConnectionAttempts": 3,
         "ConnectionTimeout": 10,
         "OriginShield": {
           "Enabled": false
         },
         "OriginAccessControlId": ""
       }
     ]
   },
   "OriginGroups": {
     "Quantity": 0
   },
   "DefaultCacheBehavior": {
     "TargetOriginId": "tio-alb-173623777.ap-northeast-2.elb.amazonaws.com",
     "TrustedSigners": {
       "Enabled": false,
       "Quantity": 0
     },
     "TrustedKeyGroups": {
       "Enabled": false,
       "Quantity": 0
     },
     "ViewerProtocolPolicy": "redirect-to-https",
     "AllowedMethods": {
       "Quantity": 7,
       "Items": [
         "HEAD",
         "DELETE",
         "POST",
         "GET",
         "OPTIONS",
         "PUT",
         "PATCH"
       ],
       "CachedMethods": {
         "Quantity": 2,
         "Items": [
           "HEAD",
           "GET"
         ]
       }
     },
     "SmoothStreaming": false,
     "Compress": true,
     "LambdaFunctionAssociations": {
       "Quantity": 0
     },
     "FunctionAssociations": {
       "Quantity": 0
     },
     "FieldLevelEncryptionId": "",
     "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
     "OriginRequestPolicyId": "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf",
     "GrpcConfig": {
       "Enabled": false
     }
   },
   "CacheBehaviors": {
     "Quantity": 3,
     "Items": [
       {
         "PathPattern": "/api/*",
         "TargetOriginId": "tio-alb-173623777.ap-northeast-2.elb.amazonaws.com",
         "TrustedSigners": {
           "Enabled": false,
           "Quantity": 0
         },
         "TrustedKeyGroups": {
           "Enabled": false,
           "Quantity": 0
         },
         "ViewerProtocolPolicy": "allow-all",
         "AllowedMethods": {
           "Quantity": 7,
           "Items": [
             "HEAD",
             "DELETE",
             "POST",
             "GET",
             "OPTIONS",
             "PUT",
             "PATCH"
           ],
           "CachedMethods": {
             "Quantity": 2,
             "Items": [
               "HEAD",
               "GET"
             ]
           }
         },
         "SmoothStreaming": false,
         "Compress": true,
         "LambdaFunctionAssociations": {
           "Quantity": 0
         },
         "FunctionAssociations": {
           "Quantity": 0
         },
         "FieldLevelEncryptionId": "",
         "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
         "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",
         "GrpcConfig": {
           "Enabled": false
         }
       },
       {
         "PathPattern": "_next/image/*",
         "TargetOriginId": "tio-frontend-assets-jungle8th.s3.ap-northeast-2.amazonaws.com",
         "TrustedSigners": {
           "Enabled": false,
           "Quantity": 0
         },
         "TrustedKeyGroups": {
           "Enabled": false,
           "Quantity": 0
         },
         "ViewerProtocolPolicy": "allow-all",
         "AllowedMethods": {
           "Quantity": 2,
           "Items": [
             "HEAD",
             "GET"
           ],
           "CachedMethods": {
             "Quantity": 2,
             "Items": [
               "HEAD",
               "GET"
             ]
           }
         },
         "SmoothStreaming": false,
         "Compress": true,
         "LambdaFunctionAssociations": {
           "Quantity": 0
         },
         "FunctionAssociations": {
           "Quantity": 0
         },
         "FieldLevelEncryptionId": "",
         "CachePolicyId": "3029b97e-cd26-4ed3-8af3-183f1ff27053",
         "OriginRequestPolicyId": "52d2456c-7610-4b88-b348-b6c1ada59267",
         "GrpcConfig": {
           "Enabled": false
         }
       },
       {
         "PathPattern": "/_next/static/*",
         "TargetOriginId": "tio-frontend-assets-jungle8th.s3.ap-northeast-2.amazonaws.com",
         "TrustedSigners": {
           "Enabled": false,
           "Quantity": 0
         },
         "TrustedKeyGroups": {
           "Enabled": false,
           "Quantity": 0
         },
         "ViewerProtocolPolicy": "redirect-to-https",
         "AllowedMethods": {
           "Quantity": 2,
           "Items": [
             "HEAD",
             "GET"
           ],
           "CachedMethods": {
             "Quantity": 2,
             "Items": [
               "HEAD",
               "GET"
             ]
           }
         },
         "SmoothStreaming": false,
         "Compress": true,
         "LambdaFunctionAssociations": {
           "Quantity": 0
         },
         "FunctionAssociations": {
           "Quantity": 0
         },
         "FieldLevelEncryptionId": "",
         "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
         "GrpcConfig": {
           "Enabled": false
         }
       }
     ]
   },
   "CustomErrorResponses": {
     "Quantity": 0
   },
   "Comment": "",
   "Logging": {
     "Enabled": false,
     "IncludeCookies": false,
     "Bucket": "",
     "Prefix": ""
   },
   "PriceClass": "PriceClass_200",
   "Enabled": true,
   "ViewerCertificate": {
     "CloudFrontDefaultCertificate": false,
     "ACMCertificateArn": "arn:aws:acm:us-east-1:941377136075:certificate/34946945-cdc1-4754-baff-d90836407c36",
     "SSLSupportMethod": "sni-only",
     "MinimumProtocolVersion": "TLSv1.2_2021",
     "Certificate": "arn:aws:acm:us-east-1:941377136075:certificate/34946945-cdc1-4754-baff-d90836407c36",
     "CertificateSource": "acm"
   },
   "Restrictions": {
     "GeoRestriction": {
       "RestrictionType": "none",
       "Quantity": 0
     }
   },
   "WebACLId": "",
   "HttpVersion": "http2",
   "IsIPV6Enabled": true,
   "ContinuousDeploymentPolicyId": "",
   "Staging": false
 }

```

## CloudFront ALB Origin `DefaultRootObject` 설정 문제

설정되어 있으면, 루트 경로(/) 요청을 /index.html로 변환해서 ALB로 보낸다고한다.

![image.png](image%2039.png)

`기본 루트 객체` 저 부분이 문제라고한다.

![image.png](image%2040.png)

완전히 비워주면 된다고한다.

어떤 역할을 하는가 보니

### 기본 루트 객체란?

- CloudFront에서 루트 경로(/) 요청을 특정 파일로 자동 변환하는 설정
- 원래 목적 : S3 정적 웹사이트에서 index.html을 기본 페이지로 제공하기 위함
    - 즉 기존에 S3 기반일때는 맞는 설정이었지만. EC2 + S3일때는 사용하지 않는게 맞다고한다.

```json
기존:
브라우저: [https://www.tio-style.com/](https://www.tio-style.com/)
CloudFront: /index.html로 변환
ALB: /index.html 요청 (Next.js에서 404)
```

```json
수정 후:
브라우저: [https://www.tio-style.com/](https://www.tio-style.com/)
CloudFront: / 그대로 전달
ALB: / 요청 (Next.js에서 정상 처리)
```

## 문제의 흐름을 쭉 따라가보자

### **Step 1: 사용자 요청**

사용자가 브라우저에 입력: [https://www.tio-style.com/](https://www.tio-style.com/)

### **Step 2: CloudFront 처리**

CloudFront 내부 동작:

1. 요청 받음: `GET /`
2. DefaultRootObject 확인: `"index.html"`
3. 자동 변환: `GET /` → `GET /index.html`
4. ALB로 전달: `GET /index.html`

### **Step 3: ALB 라우팅**

ALB 라우팅 규칙:

- Priority 50: /* → `TargetGroup-Frontend-SSR`
- `/index.html` 요청이 Next.js 서버로 전달됨

### **Step 4: Next.js 서버 처리**

Next.js 라우터:

- `pages/index.js` 또는 `app/page.tsx` → / 경로 처리
- `/index.html` 경로는 **정의되지 않음**
- 결과: `404` Not Found

## 수정 후 올바른 흐름

### **Step 1: 사용자 요청**

사용자가 브라우저에 입력: [https://www.tio-style.com/](https://www.tio-style.com/)

### **Step 2: CloudFront 처리 (수정 후)**

CloudFront 내부 동작:

1. 요청 받음: `GET /`
2. DefaultRootObject 없음: 변환하지 않음
3. 그대로 전달: `GET /`
4. ALB로 전달: `GET /`

### **Step 3: ALB 라우팅**

ALB 라우팅 규칙:

- Priority 50: /* → TargetGroup-Frontend-SSR
- / 요청이 Next.js 서버로 전달됨

### **Step 4: Next.js 서버 처리 (수정 후)**

Next.js 라우터:

- `/` 경로 → `pages/index.js` 또는 `app/page.tsx` 처리
- 결과: 200 OK, 홈페이지 반환 ✅

## 기술적 세부사항

### **CloudFront Behavior 우선순위**

1. /_next/static/* → S3 (`정적 파일`)
2. /api/* → ALB (`API 요청`)
3. /* (Default) → ALB (`HTML 페이지`)

### **Next.js 라우팅 시스템**

```json
// Next.js App Router (app 디렉토리)
app/
├── page.tsx          → / 경로
├── about/page.tsx    → /about 경로
└── contact/page.tsx  → /contact 경로
```

```json
// Next.js Pages Router (pages 디렉토리)
pages/
├── index.js          → / 경로
├── about.js          → /about 경로
└── contact.js        → /contact 경로
```

## 해결책의 효과

### **Before (문제 상황)**

```json
Request Flow:
Browser → CloudFront → ALB → Next.js
   /         /index.html /index.html    404 ❌
```

### **After (해결 후)**

```json
Request Flow:
Browser → CloudFront → ALB → Next.js
   /         /          /                200 ✅
```

### 다른 경로들은?

```json
서브 경로 요청:
/about → CloudFront → ALB → Next.js (/about) ✅
/product/123 → CloudFront → ALB → Next.js (/product/123) ✅
```

```json
정적 파일 요청:
/_next/static/css/main.css → CloudFront → S3 ✅
/_next/static/js/main.js → CloudFront → S3 ✅
```

```json
API 요청:
/api/users → CloudFront → ALB → Spring Boot ✅
```

이런식으로 흘러 간다고 한다

## 결과

![image.png](image%2041.png)

페이지는 불러와졌지만 다른 오류가 발생

이미지가 나오지않는다.