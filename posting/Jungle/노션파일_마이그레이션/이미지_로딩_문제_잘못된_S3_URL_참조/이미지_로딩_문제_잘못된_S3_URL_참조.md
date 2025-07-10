# 이미지 로딩 문제 (잘못된 S3 URL 참조)

Mixed Contents와 ALB 라우팅 문제 해결후에 찾아온 또 다른 시련

CSS와 HTML 404 문제를 해결하고 나니, 이번엔 새로운 문제들이 나를 반겼다.

![image.png](image.png)

/_next/image?url=...&w=1920&q=75 → 400 Bad Request
/api/home/products → 404 Not Found

/api/avatars/latest-info → 404 Not Found

분명히 모든 설정을 다 했는데 왜 이런 일이 생기는 걸까?

## 🔍 문제 1: Next.js Image Optimization 400 에러

### 원인 파악

브라우저 개발자 도구를 보니 이런 요청이 실패하고 있었다:

/_next/image?url=https%3A%2F%[2Ftio-image-storage-jungle8th.s3.us-east-1.amazonaws.com](http://2ftio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/)%2Fproducts%2F12697%2Fimg1.jpg&w=1920&q=75

URL을 디코딩해보니:
url=https://tio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/products/12697/img1.jpg

어? S3 URL의 리전이 us-east-1이네?

### S3 버킷 실제 리전 확인

![image.png](image%201.png)

문제 발견! 실제 S3 버킷은 ap-northeast-2에 있는데, DB에 저장된 URL은 us-east-1로 되어 있었다.

### 올바른 리전으로 테스트

```sql
# 잘못된 리전 (실패)

curl -I https://tio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/products/12697/img1.jpg

# → 404 Not Found

# 올바른 리전 (성공)

curl -I https://tio-image-storage-jungle8th.s3.ap-northeast-2.amazonaws.com/products/12697/img1.jpg

# → 200 OK
```

### DB 데이터 확인

실제 DB를 확인해보니 모든 이미지 URL이 잘못된 리전으로 저장되어 있었다:

파이썬으로 자동화해서 마이그레이션 할 때 잘못된 경로로 생성되었나보다.

```sql
sql
SELECT id, img1 FROM product LIMIT 3;
```

'2002' | '[https://tio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/products/2002/img1.jpg](https://tio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/products/2002/img1.jpg)'
'2003' | '[https://tio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/products/2003/img1.jpg](https://tio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/products/2003/img1.jpg)'

'2004' | '[https://tio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/products/2004/img1.jpg](https://tio-image-storage-jungle8th.s3.us-east-1.amazonaws.com/products/2004/img1.jpg)'

### 해결 방법

DB의 모든 이미지 URL을 올바른 리전으로 일괄 수정:

```sql
UPDATE product 
SET 
    img1 = REPLACE(img1, 's3.us-east-1.amazonaws.com', 's3.ap-northeast-2.amazonaws.com'),
    img2 = REPLACE(img2, 's3.us-east-1.amazonaws.com', 's3.ap-northeast-2.amazonaws.com'),
    img3 = REPLACE(img3, 's3.us-east-1.amazonaws.com', 's3.ap-northeast-2.amazonaws.com'),
    img4 = REPLACE(img4, 's3.us-east-1.amazonaws.com', 's3.ap-northeast-2.amazonaws.com'),
    img5 = REPLACE(img5, 's3.us-east-1.amazonaws.com', 's3.ap-northeast-2.amazonaws.com')
WHERE 
    img1 LIKE '%s3.us-east-1.amazonaws.com%' 
    OR img2 LIKE '%s3.us-east-1.amazonaws.com%'
    OR img3 LIKE '%s3.us-east-1.amazonaws.com%'
    OR img4 LIKE '%s3.us-east-1.amazonaws.com%'
    OR img5 LIKE '%s3.us-east-1.amazonaws.com%';
```