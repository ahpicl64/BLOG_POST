# presigned URL 업로드 중 403 에러 해결

## 문제 원인 정리

### **1. ACL 헤더 불일치**

- presigned URL에 x-amz-acl 서명 포함
- 실제 PUT 요청에서 ACL 헤더 누락
    - presigned URL이 x-amz-acl 헤더를 서명에 포함했다면, 실제 PUT 요청에서도 동일한 헤더를 보내야 함

### **2. 버킷 정책 부재**

- 처음에 tio-image-storage-jungle8th 버킷에 정책이 없었음
- NoSuchBucketPolicy 에러 발생했었죠

### **3. CORS 설정 부재**

- 브라우저에서 presigned URL로 PUT 요청 시 CORS 필요
- 설정 없으면 브라우저가 요청 자체를 차단

## 해결된 과정

### **단계별 해결:**

1. 버킷 정책 생성 → 기본 권한 설정
2. CORS 설정 추가 → 브라우저 요청 허용
3. ACL 헤더 문제 → Java 코드 수정 또는 헤더 추가
    1. 프론트엔드에서 ACL 헤더 추가 또는
        
        ```jsx
        const response = await fetch(presignedUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
            'x-amz-acl': 'public-read'  // 이 헤더가 필요!
          }
        });
        ```
        
    2. 백엔드에서 presigned URL 생성 시 ACL 제거
        
        ```jsx
        // 예시 코드 - ACL 제거
        GeneratePresignedUrlRequest generatePresignedUrlRequest =
            new GeneratePresignedUrlRequest("tio-image-storage-jungle8th", key)
                .withMethod(HttpMethod.PUT)
                .withExpiration(expiration);
                // .withCannedAcl() 제거!
        
        URL presignedUrl = s3Client.generatePresignedUrl(generatePresignedUrlRequest);
        ```
        

### **최종 설정 상태:**

```jsx
json
// 버킷 정책
{
"AllowImageUpload": "계정 내 업로드 권한",
"AllowPublicRead": "퍼블릭 읽기 권한"
}
// CORS 설정
{
"AllowedOrigins": ["localhost:3000", "localhost:8080", "[tio-style.com](http://tio-style.com/)"],
"AllowedMethods": ["PUT", "POST", "GET"]
}
```

### ACL 헤더 문제 해결위한 백엔드 코드 수정

```jsx
이런 코드가 있다면 제거
.withCannedAcl(...)
.setCannedAcl(...)
.acl(...)
```

### **수정 전 presigned URL:**

`X-Amz-SignedHeaders=host%3Bx-amz-acl`  // ACL 헤더 포함

### **수정 후 presigned URL:**

`X-Amz-SignedHeaders=host`  // ACL 헤더 없음

## 🔍 각 문제의 증상

### **버킷 정책 없을 때:**

- 403 Forbidden (권한 자체가 없음)

### **CORS 설정 없을 때:**

- 브라우저 콘솔에 CORS 에러
- 네트워크 탭에서 preflight 요청 실패

### **ACL 헤더 불일치:**

- 403 Forbidden (서명 불일치)
- presigned URL은 생성되지만 실제 업로드 실패

## 결론

세 가지 문제가 모두 해결되어야 정상 작동하는 상황이었음

- ✅ 버킷 정책: 업로드 권한 부여
- ✅ CORS 설정: 브라우저 요청 허용
- ✅ ACL 처리: 서명 일치