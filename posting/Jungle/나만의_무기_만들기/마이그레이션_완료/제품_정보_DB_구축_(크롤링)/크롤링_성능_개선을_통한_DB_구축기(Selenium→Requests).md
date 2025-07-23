# 17일? 못 기다려! 크롤러 성능 개선 삽질기 (Selenium → Requests)

## 시작하기에 앞서: 데이터 관련 고지
본문에 기술된 데이터 수집(크롤링)은 대규모 데이터를 다루는 개발 환경을 시뮬레이션하고 학습하기 위한 개인 프로젝트 목적으로만 진행되었습니다.

수집된 모든 정보(텍스트, 이미지 등)의 저작권과 지적재산권은 원본 출처인 **'무신사(Musinsa)'** 에 있습니다.

해당 데이터는 어떠한 상업적 목적으로도 사용되지 않았으며, 학습 프로젝트가 종료된 직후 데이터베이스를 포함한 모든 수집 데이터는 완벽하고 안전하게 파기되었음을 명확히 밝힙니다.

## 1. 프로젝트 배경: 10만 건의 데이터가 필요해!

현재 저희 프로젝트는 약 `1만 9천 건`의 제품 정보를 보유하고 있습니다. 

하지만 실제 이커머스와 유사한 대규모 트래픽 환경을 시뮬레이션하고, 그 과정에서 발생할 수 있는 데이터베이스 및 인프라 문제를 `미리 경험하고 해결` 하기 위해 **최소 10만 건 이상의 제품 정보**가 필요하다고 판단했습니다.

(그리고 최적화 지옥에 빠지게 되었습니다. N+1, redis 캐싱, 인덱싱 / 커버링인덱싱 etc... 이후에 다룰 예정입니다.)

> **왜 10만 건인가?**
> 약 1만 건의 데이터는 단일 AWS RDS 인스턴스로도 충분히 운영할 수 있습니다. 
> 
> 하지만 데이터가 10만 건, 100만 건으로 늘어났을 때 어떤 성능 병목 현상이 발생할까요? 데이터베이스 아키텍처는 어떻게 개선해야 할까요? 
> 
> 이런 고민들을 시작하기 위한 최소한의 데이터 규모라고 생각했습니다.

## 2. 1차 시도: Selenium 기반 크롤러

처음에는 `Selenium`을 이용해 크롤러를 구현했습니다. 초기 코드는 특정 카테고리의 URL과 ID를 수동으로 입력해야 했지만, 모든 카테고리를 자동으로 순회하며 기본 정보(제품명, 가격 등)를 수집한 뒤, 각 제품의 상세 페이지에 다시 접근해 이미지 정보를 가져오는 방식으로 개선했습니다.

**EC2에서 실행**은 다음과 같이 설정했습니다.

```bash
# 가상환경 설정 및 활성화
python3 -m venv venv
. venv/bin/activate

# EC2에서 백그라운드 실행 및 로그 저장
nohup python3 crawler_ec2.py > crawler.log 2>&1 &

# 프로세스 ID 저장
echo $! > crawler.pid

# 실시간 로그 확인 (로컬에서 SSM 사용)
aws ssm start-session --target i-0944cb697cdd66c31 --region ap-northeast-2
tail -f ~/crawler/crawler.log
```


### 문제 발생: 예상 소요 시간 17일

카테고리별로 `1만 건`의 상품을 목표로 크롤러를 실행했는데, 예상과 달리 약 `21만 건`의 상품 정보가 수집되었습니다. 문제는 그다음이었습니다. 상세 정보를 가져오는 속도가 **1건당 약 7초**나 걸렸습니다.

남은 21만 2천 건의 상세 정보를 모두 가져오려면... **약 17일**이 걸린다는 계산이 나왔습니다.

![image.png](./image.png)

> 한세월이다...

일단 크롤링을 멈추고, 이 느린 속도의 원인을 분석했습니다.

### 원인 분석: Selenium vs. Requests

| 항목 | Selenium (건당 7초) | Requests (건당 1~2초 예상) |
| :--- | :--- | :--- |
| **동작 방식** | 실제 브라우저(Chrome) 실행 | 단순 HTTP 요청/응답 |
| **리소스 로딩**| HTML, CSS, **JavaScript**, 이미지, 폰트 모두 로딩 | **HTML**만 다운로드 |
| **렌더링** | JavaScript 실행 후 화면 렌더링 | 렌더링 없음 |
| **메모리** | RAM 100-200MB | RAM 몇 MB |
| **결론** | 사용자와 유사한 환경이지만, 매우 느리고 무거움 | 가볍고 빠르지만, JS로 동적 생성되는 콘텐츠는 못 봄 |

속도 저하의 주범은 **실제 브라우저를 구동하는 데 드는 오버헤드**였습니다. 상세 이미지를 가져오는 작업은 JavaScript 렌더링이 굳이 필요 없다고 판단하여, `requests` 라이브러리로 전환하기로 했습니다.

---

## 3. 2차 시도: Requests 전환과 새로운 난관

기존에 수집된 `21만 건`의 데이터에서 상세 정보가 없는 상품만 필터링하여 `requests`로 다시 수집하는 코드를 작성했습니다.

```python
import requests
from bs4 import BeautifulSoup
import json
import time
import logging

class MusinsaDetailCrawler:
    def __init__(self):
        # ... (requests 기반 크롤러 초기 구현)
    
    def process_missing_details(self, input_filename, output_filename=None):
        # ... (상세 정보 없는 상품만 처리하는 로직)
```

### 결과1: 속도는 빨라졌지만...

![image1.png](./image1.png)

속도는 눈에 띄게 빨라졌지만, 곧바로 새로운 문제에 부딪혔습니다.

### 결과2: 서버의 역습 (429 Client Error)

너무 빠른 속도로 요청을 보내자 서버에서 **접속을 차단**했습니다.

![image2.png](./image2.png)

급하게 `time.sleep(0.5)`를 추가하여 요청 간 딜레이를 주었습니다.

### 결과3: 데이터가 안 들어온다?

가장 큰 문제는 따로 있었습니다. 크롤링은 성공한 것처럼 보였지만, 정작 필요한 성별, 이미지 등의 데이터가 **하나도 저장되지 않았습니다.**

---

## 4. 디버깅: 원인을 찾아서

### 가설: 동적 콘텐츠 문제

`requests`는 JavaScript를 실행하지 않기 때문에, JS로 동적으로 생성되는 데이터는 가져올 수 없습니다. 아마도 이 문제일 것이라 추측하고 검증에 들어갔습니다.

#### 1단계: 데이터 확인용 코드 추가

먼저 `requests`로 가져온 HTML에 정말로 '성별' 정보가 없는지 확인하기 위해 디버깅 코드를 추가했습니다.

```python
# 성별 정보 추출 - 다양한 방법으로 시도
gender_extracted = False

# 1. 전체 HTML에서 '성별' 텍스트 검색
print("DEBUG: 전체 HTML에서 '성별' 검색 중...")
if '성별' in soup.get_text():
    print("DEBUG: HTML에 '성별' 텍스트가 존재합니다")
    # ...
else:
    print("DEBUG: HTML에 '성별' 텍스트가 없습니다")
# ... (이하 디버깅 코드)
```

결과는 예상대로였습니다.
> "DEBUG: HTML에 '성별' 텍스트가 없습니다"
> "DEBUG: 성별 정보 없음 - 유니섹스로 설정"

#### 2단계: 기본 연결 테스트

혹시 모를 다른 문제를 확인하기 위해, `requests`가 정상적으로 웹페이지에 접근하는지 테스트하는 코드를 작성했습니다.

```python
import requests
import time

def test_basic_requests():
    """기본적인 requests 테스트"""
    # ... (구글, 무신사 메인, 상품 페이지 연결 테스트)

# ... (이하 테스트 코드)
```

![image3.png](./image3.png)

테스트 결과, 연결 자체는 문제가 없었습니다. 문제는 순수 HTML의 내용물이었습니다.

#### 3단계: HTML 구조 분석

그렇다면 데이터는 어디에 숨어있을까요? `requests`로 받은 HTML 소스를 파일로 저장하고 분석하는 코드를 작성했습니다.

```python
import requests
from bs4 import BeautifulSoup
import json

def analyze_product_page():
    """무신사 상품 페이지 HTML 구조 분석"""
    # ... (페이지 로드, 태그 분석, JSON 데이터 검색 로직)
    
    # 5. JSON 데이터 찾기 (Next.js 앱이므로 JSON 데이터가 있을 수 있음)
    print(f"\n📊 JSON 데이터 분석:")
    script_tags = soup.find_all('script')
    for script in script_tags:
        if script.string and ('__NEXT_DATA__' in script.string or 'product' in script.string.lower()):
            # ...
```

### 유레카! 숨겨진 JSON 데이터를 찾다

마침내 해답을 찾았습니다! 상품의 모든 상세 정보는 HTML 내의 `<script>` 태그 안에 `window.__MSS__.product.state`라는 JavaScript 객체 형태로 고스란히 들어있었습니다.

![image4.png](./image4.png)

```javascript
// HTML 소스코드 안에 이런 형태로 데이터가!
<script>
  window.__MSS__.product.state = {
    "goodsNo": 3264266,
    "goodsNm": "크롭 컬러 맨투맨 (오트밀)",
    "genders": ["W"],
    "goodsImages": [
      {"imageUrl": "/images/prd_img/.../detail_..._500.jpg"},
      ...
    ],
    "goodsContents": "<center><img src='...'>...</center>"
  };
</script>
```

이제 `Selenium`처럼 무겁게 브라우저를 렌더링할 필요 없이, `requests`로 HTML을 가져온 뒤 **정규표현식으로 이 JSON 데이터만 쏙 빼내면** 되는 것이었습니다!

---

## 5. 3차 시도: JSON 파싱, 그리고 마지막 관문

### 개선된 크롤러: Regex + JSON 파싱

정규식을 이용해 `window.__MSS__.product.state` 객체를 통째로 추출하고, `json.loads()`로 파싱하여 데이터를 가져오는 방식으로 크롤러를 수정했습니다.

![image5.png](./image5.png)

데이터는 제대로 들어왔지만, 이번엔 **이미지**가 문제였습니다. 관련 없는 아이콘, 로고까지 모두 수집되거나, 정작 필요한 상품 이미지는 누락되는 경우가 많았습니다.

### "진작에 JSON 파일을 뜯어봤어야..."

수많은 이미지 필터링 로직을 추가하며 디버깅하던 중, 문득 깨달았습니다.

> "파싱할 생각만 하지 말고, 추출한 JSON 데이터 전체를 한번 뜯어보자."

디버깅용으로 상품 하나에 대한 `window.__MSS__.product.state` 객체를 통째로 파일에 저장했습니다.

```json
{
  "goodsNo": 3264266,
  "goodsNm": "크롭 컬러 맨투맨 (오트밀)",
  "sex": [
    "여성"
  ],
  "goodsImages": [
    {
      "kind": "D",
      "repYn": true,
      "imageUrl": "/images/prd_img/20230426/3264266/detail_3264266_16825911488943_500.jpg"
    }
  ],
  "goodsContents": "<center><img alt=\"\" src=\"[https://worksby00.cafe24.com/cargobros/WOMEN/TOP/CBW232204_top.jpg](https://worksby00.cafe24.com/cargobros/WOMEN/TOP/CBW232204_top.jpg)\"></center>\n...",
  "genders": [
    "W"
  ]
}
```

![image7.png](./image7.png)

데이터는 명확했습니다.
-   **메인 이미지들**: `goodsImages` 배열에 정확히 들어있었습니다.
-   **상세 이미지들**: `goodsContents` 키에 HTML 형태로 들어있었습니다.
-   **성별**: `genders` 키에 `M` 또는 `W`로 구분되어 있었습니다.

더 이상 복잡한 이미지 필터링이나 추측성 코드는 필요 없었습니다.

### 진짜 최종 코드

이 발견을 토대로 최종 크롤러 코드를 완성했습니다.

```python
import requests
import json
import time
import logging
import re
from typing import List, Dict, Any

class MusinsaDetailCrawler:
    def __init__(self):
        # ... (세션 초기화)

    def get_full_url(self, url_path: str) -> str:
        # ... (상대 경로 -> 절대 URL 변환)

    def check_image_exists(self, image_url: str, referer_url: str) -> bool:
        # ... (Referer 헤더 포함 이미지 존재 여부 확인)

    def get_product_detail_info(self, product_info: Dict[str, Any]) -> Dict[str, Any]:
        """JSON 키 직접 파싱과 Referer 헤더를 사용하여 정확한 상세 정보를 수집합니다."""
        # ... (HTML 로드)
        
        # 1. 정규식으로 JSON 객체 추출
        pattern = r'window\.__MSS__\.product\.state\s*=\s*({.*?});'
        match = re.search(pattern, html_content, re.DOTALL)
        if not match: return product_info
        product_data = json.loads(match.group(1))

        # 2. 성별 정보 파싱 (genders 키)
        genders = product_data.get('genders', [])
        product_info['gender'] = 'F' if "W" in genders else 'M' if "M" in genders else 'U'

        # 3. 메인 이미지 파싱 (goodsImages 키)
        main_images = [self.get_full_url(img.get('imageUrl')) for img in product_data.get('goodsImages', [])]
        
        # 4. 상세 이미지 파싱 (goodsContents 키)
        detail_images = []
        goods_contents_html = product_data.get('goodsContents', '')
        if goods_contents_html:
            extracted_urls = re.findall(r'src="([^"]+)"', goods_contents_html)
            for url in extracted_urls:
                full_url = self.get_full_url(url)
                if self.check_image_exists(full_url, detail_url): # 핫링킹 우회
                    detail_images.append(full_url)
        
        # ... (데이터 최종 정리 및 반환)
        return product_info
```

### 마침내 성공!

최종 스크립트가 정상적으로 동작하는 것을 로그로 확인할 수 있었습니다.

![image8.png](./image8.png)
![image9.png](./image9.png)
![image10.png](./image10.png)

약 5일(스크립트 수정 2일, 실행 3일)에 걸친 대장정 끝에 **총 217,999건**의 제품 상세 정보 수집을 완료했습니다.

![image11.png](./image11.png)

---

## 6. 수집 그 이후: 데이터베이스 적재와 마이그레이션

### Variant 데이터 삽입

수집한 상품 정보를 기반으로 `variant`(재고) 데이터를 생성하니 약 **422만 건**의 레코드가 만들어졌습니다.

`LOAD DATA INFILE`은 대용량 처리 중 자꾸 에러가 발생하여, 결국 1,000건씩 묶어 `INSERT`하는 배치(batch) 방식으로 안정적으로 주입을 완료했습니다.

![image15.png](./image15.png)
![image16.png](./image16.png)

### S3 이미지 마이그레이션

마지막으로, 외부 이미지 링크를 그대로 사용할 수 없으므로 모든 이미지를 저희 S3 버킷에 업로드하고, 데이터베이스의 이미지 URL을 새로운 S3 주소로 업데이트하는 마이그레이션 스크립트를 실행했습니다.

![image13.png](./image13.png)

```python
#!/usr/bin/env python3
import json
import boto3
import requests
import pymysql

class S3ImageMigrator:
    # ... (S3 및 DB 설정)

    def download_image(self, url, timeout=30):
        # ... (이미지 다운로드 로직)
    
    def upload_to_s3(self, image_data, s3_key):
        # ... (S3 업로드 로직)

    def run_migration(self):
        # ... (전체 상품 조회 및 마이그레이션 실행 로직)
```

## 7. 마무리하며

단순히 많은 데이터를 모으는 것을 넘어, 크롤링 과정에서 마주치는 다양한 문제(성능, 서버 차단, 동적 콘텐츠)들을 해결하며 값진 경험을 할 수 있었습니다.

-   **Selenium**은 편리하지만 대규모 작업에는 부적합하다.
-   **Requests**는 빠르지만 동적 콘텐츠에는 한계가 있다.
-   **사이트 구조 분석**과 **디버깅**이 크롤링의 핵심이다. 때로는 코드를 짜는 것보다, 데이터 원본을 꼼꼼히 들여다보는 것이 더 빠르다.
-   대용량 데이터 처리는 언제나 **예상치 못한 문제**를 동반한다.

이로써 대규모 트래픽을 시뮬레이션하고 서비스 아키텍처를 개선해나갈 튼튼한 기반을 마련했습니다. 앞으로 이 데이터를 활용해 어떤 재미있는 문제들을 해결하게 될지 기대됩니다!