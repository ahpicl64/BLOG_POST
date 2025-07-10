# AWS 인프라 구축기 6편: 트러블슈팅과 최종 해결

지난 편에서 CI/CD 파이프라인 구축을 완료했습니다. 이번 편에서는 실제 배포 과정에서 발생한 다양한 문제들과 해결 과정을 다뤄보겠습니다.

## 트러블슈팅 과정

하지만 현실은 그렇게 호락호락하지 않았습니다. 실제 배포 과정에서 여러 문제들이 발생했고, 이를 해결하는 과정을 기록해보겠습니다.

### 이슈발생 1: JAR 파일 찾기 실패

![alt text](image-103.png)

'Zip deployment package' 단계에서 cp build/libs/*.jar ... 명령어가 실패

이를 위해 일단 내부에 어떤 `.jar`이 생기는지 확인하자.

`Build with Gradle` 다음 단계에 디버깅용 코드를 추가하고 push 하여, github actions의 콘솔을 확인한다.

```yaml
    # 5. Spring Boot 애플리케이션 빌드
    - name: Build with Gradle
      run: ./gradlew build

    # --- [추가] 디버깅용 단계 ---
    - name: Check for JAR file
      run: |
        echo "--- Checking the contents of build/libs directory ---"
        ls -l build/libs
    # --- 여기까지 추가 ---

    # 6. AWS 자격 증명 설정
    - name: Configure AWS credentials
      # ... 이하 생략 ...

```

#### actions 실행 결과

![alt text](image-104.png)

### 원인 : 기대한 SNAPSHOT.jar가 아닌 SNAPSHOT-plain.jar와 같이 두개의 파일이 존재

`core-0.0.1-SNAPSHOT-plain.jar` (라이브러리만 담긴 작은 파일)  
`core-0.0.1-SNAPSHOT.jar` (실행 가능한 모든 것이 포함된 큰 파일)

actions의 `deploy.yml`을 보면 run에서 `*.jar`으로 모든 파일을 집어오게하여, 우리가 원하는 파일이 아닌 것 까지 가져와서 실패한 것이다.

```yaml
    # 7. 배포 패키지 압축
    - name: Zip deployment package
      run: |
        mkdir -p deploy
        cp build/libs/*.jar deploy/application.jar
        cp appspec.yml deploy/appspec.yml
        cp -r scripts deploy/scripts
        cd deploy && zip -r deploy.zip .
```

### 해결 : run 스크립트를 변경하여, 정확한 파일만 가져오도록 변경

- 기존: `cp build/libs/*.jar deploy/application.jar`
- 변경: `cp $(find build/libs -name "*.jar" ! -name "*-plain.jar") deploy/application.jar`

`build/libs`폴더에서 .jar로 끝나지만, -plain.jar는 아닌 파일만 찾아내는 명령어이다.

이제 수정해서 다시 실행해보자.

### 이슈 발생 2: 배포 그룹을 찾을 수 없음

![alt text](image-105.png)

### 원인 : 배포 그룹 이름 불일치

deploy.yml의 배포 그룹이 일치하지 않거나, 다른 리전일 경우가 될 수 있다.

CodeDeploy 애플리케이션 > `TIO-Shop-Application` > 배포 그룹을 보면
![alt text](image-106.png)
`TIO-Spring-CodeDeploy-Group`이라고 되어있다.
코드를 보면.

```yaml
      # 9. AWS CodeDeploy 배포 실행
      - name: Deploy to AWS CodeDeploy
        run: |
          aws deploy create-deployment \
            --application-name TIO-Shop-Application \
            --deployment-group-name TIO-Spring-Deployment-Group \
            --s3-location bucket=${{ secrets.AWS_S3_BUCKET_NAME }},bundleType=zip,key=spring-app/deploy.zip
```

맞다.. 내가 틀렸다 😭 그냥 yaml을 CodeDeploy 애플리케이션의 배포 그룹명으로 맞춰주면 끝난다.

### 이슈 3 : 접근 거부 (권한 문제?)

![alt text](image-107.png)

제미나이를 통해 도움받아서 작성한 IAM 정책이 `부족한 부분`이 있었나보다.

### 원인 : 권한 부족

CodeDeploy의 `create-deployment` 명령어는 내부적으로 여러 개의 세부적인 권한(예: 개정판 등록, 배포 그룹 정보 가져오기 등)을 필요.  
또한, CodeDeploy 서비스가 우리의 EC2에 배포 작업을 수행할 수 있도록 역할을 넘겨주는 `iam:PassRole` 권한도 필수적임

### 해결: 정책 수정

actions 전용으로 만들어준 IAM 유저인 `github-actions-deployer`의 정책을 수정해준다.
![alt text](image-108.png)

![alt text](image-109.png)

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3ArtifactAccess",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject"
            ],
            "Resource": "arn:aws:s3:::your-artifact-bucket-name/*"
        },
        {
            "Sid": "CodeDeployActions",
            "Effect": "Allow",
            "Action": [
                "codedeploy:CreateDeployment",
                "codedeploy:GetDeployment",
                "codedeploy:GetDeploymentConfig",
                "codedeploy:GetApplicationRevision",
                "codedeploy:RegisterApplicationRevision",
                "codedeploy:GetDeploymentGroup"
            ],
            "Resource": "*"
        },
        {
            "Sid": "CodeDeployRolePassing",
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "arn:aws:iam::YOUR_AWS_ACCOUNT_ID:role/TIO-CodeDeploy-Role"
        }
    ]
}
```

수정할 부분:

- `your-artifact-bucket-name`: 이전에 GitHub Secret에 저장했던 S3 버킷 이름으로 변경. (예: tio-cicd-artifacts)
- `YOUR_AWS_ACCOUNT_ID`: 본인의 12자리 AWS 계정 ID로 변경. (콘솔 오른쪽 상단에서 확인 가능, `-`는 빼고 숫자만)
  - 왜 내 AWS 계정 id를 넣어줘야하나? : 관리자의 권한 위임을 해준다는 개념으로 이해하면됨

![alt text](image-110.png)

정책을 수정해주면, 아래와 같이 `IAM` 권한이 하나 더 생겼다.

## 진짜 끝

![alt text](image-111.png)

github actions가 다 정상적으로 돌아갔고, 배포에 성공했다! 🎉

(아마도?)

## 성공 확인하기

### 1. CodeDeploy 배포 콘솔 확인

![alt text](image-112.png)

![alt text](image-113.png)

이상없다 😭

### 2. EC2 서버 직접 확인 (애플리케이션 실행 여부)

CodeDeploy가 성공했더라도, Spring Boot 애플리케이션 자체가 실행 중에 오류를 일으켜 바로 종료되었을 수도 있다고 한다. (예: DB 접속 정보 오류, 설정 파일 누락 등)

SSH 포트를 닫았으므로, SSM 세션 관리자를 통해 서버에 안전하게 접속하여 직접 확인 해야한다.

1. **EC2 콘솔** \> **인스턴스**로 이동

![alt text](image-114.png)

2. `TIO-Spring-Server` 중 하나를 선택하고, 상단의 **[연결(Connect)]** 버튼을 클릭

![alt text](image-115.png)

3. **'세션 관리자(Session Manager)'** 탭을 선택하고, **[연결]** 버튼 클릭 (브라우저에 검은색 터미널 창이 나타난다)

![alt text](image-116.png)

4. 터미널에 아래 명령어들을 입력하여 확인

      - **프로세스 확인:** `java` 프로세스가 실행 중인지 확인

        ```bash
        ps -ef | grep java
        ```

        ![alt text](image-117.png)

        명령어를 실행했을 때, `... application.jar` 와 같은 내용이 보인다면 성공적으로 실행 중인 것, 아무것도 나타나지 않는다면 실행에 실패한 것...

      - **배포 로그 확인:** 저희가 `start_server.sh`에 설정한 로그 파일을 확인하여 배포 과정에 문제가 없었는지 본다

        ```bash
        cat /home/ec2-user/app/deploy.log
        ```

        ![alt text](image-118.png)

        선명히 보이는 `permission denied`.. 원인이 뭘까?
        ssm으로 접속했을때와 파일을 생성할때의 사용자 정보가 다르다고한다. 그럼 우리는 마법의 주문인 `sudo` 를 사용하면 된다.

        ![alt text](image-119.png)

        ```bash
        sudo cat /home/ec2-user/app/deploy.log
        ```

      - **애플리케이션 에러 로그 확인 (가장 중요\!):** 애플리케이션 실행 실패 시, 원인이 여기에 기록된다.

        ```bash
        cat /home/ec2-user/app/deploy_err.log
        ```

        "DB에 연결할 수 없습니다", "설정 파일을 찾을 수 없습니다" 등의 구체적인 에러 메시지가 있는지 확인한다.

        `없다` 만세!!!!!!!!!!!!!!!!!!!!!!!!!

### **3단계: 대상 그룹 상태 확인 (가장 확실한 건강 상태)**

이것이 \*\*"애플리케이션이 외부의 요청을 받을 준비가 되었는가"\*\*를 확인하는 가장 확실한 방법이라고한다

1. **EC2 콘솔** \> \*\*대상 그룹(Target Groups)\*\*으로 이동
2. `TargetGroup-Spring-App`을 선택하고, 아래의 **[대상(Targets)] 탭**을 클릭

![alt text](image-120.png)
3. 등록된 인스턴스 2개의 상태(Status)를 확인합니다.
      - 상태가 녹색으로 **`healthy`** 라고 표시되어 있다면, 이는 ALB가 주기적으로 EC2 서버의 `/actuator/health` 경로로 신호를 보냈고, Spring Boot 애플리케이션이 "저 건강해요\!" 라는 정상적인 응답(HTTP 200 OK)을 보내줬다는 의미. **이 상태라면 애플리케이션이 완벽하게 구동 중이라고 확신할 수 있다고한다.**
      - 만약 `unhealthy`라면, 애플리케이션이 응답하지 않거나 에러를 반환한다는 뜻이므로 2단계의 에러 로그를 다시 확인해야 한다.
      ![alt text](image-121.png)

### 원인찾기

'Unhealthy' 상태는 로드밸런서(ALB)가 EC2 서버에게 "잘 지내?" 라고 안부 인사(Health Check)를 보냈는데, 서버가 "나 아파" 라고 응답하거나, 아예 응답조차 하지 않았다는 뜻  
원인은 여러 가지일 수 있으니, 아래 순서대로 차근차근 점검하면 된다.

#### **1단계: 애플리케이션 로그 확인 (가장 먼저\!)**

가장 흔한 원인은 **애플리케이션이 실행되다가 에러가 나서 바로 종료**되는 경우

1. 이전과 같이 **SSM 세션 관리자**로 EC2 인스턴스 중 하나에 접속합니다.
2. `ec2-user`로 변신한다.

    ```bash
    sudo su - ec2-user
    ```

    실행하면 커맨드 라인이 `sh-5.2$`에서 `[ec2-user@ip-어쩌구 -]$`로 바뀐다.
3. **에러 로그 파일**을 확인하여 애플리케이션이 왜 죽었는지 확인합니다. 이 파일에 모든 단서가 들어있을 확률이 가장 높습니다.

    ```bash
    cat /home/ec2-user/app/deploy_err.log
    ```

      - 혹시 `DB 접속 정보가 틀렸습니다`, `설정 파일을 찾을 수 없습니다`, `필요한 Bean을 찾을 수 없습니다` 같은 Spring Boot 에러 메시지가 있는지 확인해 보자
      ![alt text](image-122.png)
      이렇게 아무것도 안뜨고 다음 줄로 넘어가면 2단계로 넘어가면된다.

#### **2단계: EC2 인스턴스 내부에서 직접 상태 검사**

애플리케이션은 실행 중이지만 상태 검사 요청에 제대로 응답하지 못하는 경우일 수 있다고한다.  
서버 내부에서 직접 테스트해 보자

1. 위와 같이 SSM으로 서버에 접속한 상태에서, 아래 명령어를 실행

    ```bash
    curl -v http://localhost:8080/actuator/health
    ```

    이 명령어는 서버 자기 자신에게 상태 검사 요청을 보내보는 것이라고한다
    ![alt text](image-123.png)

2. **결과를 확인**

      - **정상적인 경우:** 출력 메시지 중에 `< HTTP/1.1 200 OK` 와 함께 `{"status":"UP"}` 같은 JSON 응답이 보인다. 이렇다면 애플리케이션 자체는 건강한 것이다
      - **비정상적인 경우:**
          - `Connection refused`: 8080 포트에서 아무것도 실행되고 있지 않다는 뜻
          (1단계의 `ps -ef | grep java`로 다시 확인)
          - `404 Not Found`: `/actuator/health` 라는 경로가 존재하지 않는다는 뜻, 혹시 `build.gradle`에 `spring-boot-starter-actuator` 의존성을 추가했는지 확인
          - `500 Internal Server Error` 또는 `503 Service Unavailable`: 앱이 실행은 됐지만, DB 연결 실패 등으로 인해 스스로 '아프다'고 응답하는 경우 (1단계 에러 로그 확인)

> 우리는 `HTTP/1.1 403`을 뱉고있다
> 이 말은, `요청 주소는 존재하지만, 접근할 권한이 없다` 라는 의미로 다음 단계로 넘어가면된다.

### 최종 원인 발견 : Spring Security 설정

Spring Boot의 `spring-boot-starter-security` 의존성이 있으면 모든 엔드포인트를 보호한다.

#### 해결 : `application.yml` 또는 `application.properties`파일 수정

`application.yml 파일

```yaml
management:
  endpoints:
    web:
      exposure:
        include: "health"  # health 엔드포인트만 외부에 노출하도록 허용
  endpoint:
    health:
      show-details: never  # 보안을 위해 상세 정보는 노출하지 않음
```

`application.properties` 파일 아래 두 줄 추가

```properties
management.endpoints.web.exposure.include=health
management.endpoint.health.show-details=never
```

- management.endpoints.web.exposure.include: "health": Actuator의 여러 웹 엔드포인트 중에서, health 엔드포인트만은 인증 없이도 접근할 수 있도록 외부에 노출(expose)하겠다는 설정

- management.endpoint.health.show-details: never: 상태가 'UP'인지 'DOWN'인지만 보여주고, 어떤 데이터베이스에 연결되었는지 같은 민감한 상세 정보는 절대 노출하지 않도록 설정하는 것 (보안)

### 여전히 403

다시 배포 완료하고 헬스체크해도 HTTP/1.1 403을 뱉는다.

SecurityConfig에 health 엔드포인트를 직접적으로 추가해준다.

내부적인 원인은 `.anyRequest().authenticated()` 구문에 의해서인데. 이친구가 "지금까지 허용한 주소들 외의 다른 모든 요청은 무조건 인증이 필요하다"라는 강력한 규직을 준 것임.

그래서 `requestMathcers` 최 상단에 추가해준다.

1. build.gradle에 의존성 추가: `implementation 'org.springframework.boot:spring-boot-starter-actuator'
`
1. `SecurityConfig.java`

기존에 만들어진 SecurityConfig.java가 있어서, `import문`과, `health Check 허용 규칙`을 추가했다.

```java
import org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest;

public class SecurityConfig {

        // 인가 정책 (수정된 부분)
        http.authorizeHttpRequests(auth -> auth
            // --- [이 부분 추가!] ---
            .requestMatchers(EndpointRequest.to("health")).permitAll() // Health Check는 모두에게 허용
            // --- 여기까지 추가 ---
            .requestMatchers(
            "/", "/auth/**", "/h2-console/**",
            "/swagger-ui/**", "/v3/api-docs/**", "/swagger-resources/**", "/webjars/**"
            ).permitAll()
            .requestMatchers("/admin").hasRole("ADMIN")
            .requestMatchers("/product").hasAnyRole("ADMIN", "USER")
            .anyRequest().authenticated()
        )

}
```

그리고 다시 헬스체크 해본다.

![alt text](image-124.png)

야호!!!! 200이다

## 다시 이어서 성공확인하기

### **4단계: ALB 엔드포인트로 API 테스트 (최종 관문)**

대상 그룹이 `healthy`인 것을 확인했다면, 이제 외부 세계에서 실제 API를 호출해볼 차례입니다.

1. **EC2 콘솔** \> \*\*로드 밸런서(Load Balancers)\*\*로 이동합니다.

![alt text](image-125.png)
2. `TIO`를 선택하고, 세부 정보에서 \*\*DNS 이름(DNS name)\*\*을 복사. (예: `TIO-ALB-173623777.ap-northeast-2.elb.amazonaws.com`)
3. Postman 같은 API 테스트 도구나, 웹 브라우저 주소창에 `http://<복사한-ALB-DNS-이름>/` 또는 테스트용으로 만들어두신 API 경로를 입력하여 호출
4. 정상적인 JSON 응답이나 웹페이지가 보인다면, 모든 과정이 성공적으로 끝난 것

![alt text](image-126.png)

### 504...?

겁내지말자 오히려 긍정적인 신호이다.  
`Unhealthy가 아님` → 이제 ALB가 보낸 Health Check에 서버가 정상적으로 응답
`403 Forbidden이 아님` → 보안 설정도 통과

- 이 상황은 사용자(나)의 요청이 ALB에 성공적으로 도착

- ALB는 건강한 EC2 서버를 찾아 그 요청을 성공적으로 전달

- EC2 서버의 Spring Boot 애플리케이션이 요청을 받았지만, 응답을 보내주는 데 너무 오랜 시간이 걸림

- 참을성 있게 기다리던 ALB가 결국 "더는 못 기다리겠다"며 포기하고, 사용자에게 "게이트웨이(백엔드 서버)에서 시간 초과가 발생했습니다" 라는 504 에러를 대신 보내준 것

가장 흔한 이유는 `DB 연결 중 첫 시도에서 실패하는것` 이라고 한다.

에러 로그부터 확인한다. `sudo su - ec2-user`, `cat /home/ec2-user/app/deploy_err.log`

아무것도 안뜬다. 

#### RDS 확인하기
콘솔로 가서 `tio-db`의 엔드포인트 주소를 복사한다
`tio-db.cjgee4eswvls.ap-northeast-2.rds.amazonaws.com`

인스턴스 SSM 콘솔로 다시 들어가서, 
`nc -zv RDS-엔드포인트-주소 3306`을 입력한다
> nc는 네트워크 연결을 테스트하는 도구  
> -zv는 연결 과정의 상세한 결과 (verbose)를 보여주고 실제 데이터는 안보내고 연결 가능 여부만 확인한다(zero-I/O).

안되면 아래 코드로 진행한다

```bash
timeout 10 bash -c '</dev/tcp/tio-db.cjgee4eswvls.ap-northeast-2.rds.amazonaws.com/3306' && echo "SUCCESS: Port is open" || echo "FAILURE: Port is closed or blocked"
```


`SUCCESS: Port is open`  
이 메시지가 나타나면, 네트워크와 보안 그룹 설정에 아무런 문제가 없다는 100% 확실한 증거. 문제는 애플리케이션의 설정(DB 주소, 자격 증명 등)에 있다.

`FAILURE: Port is closed or blocked`  
이 메시지가 나타나면, 문제는 100% 네트워크 또는 보안 그룹 문제라는 확실한 증거. 이 경우 TIO-DB-SG의 인바운드 규칙에 TIO-Spring-EC2-SG가 3306 포트로 허용되어 있는지 다시 점검

![alt text](image-128.png)


### 원인 : 로컬 개발용 H2 설정문제
`application.properties`의 DB 설정이 문제였다.

`spring.datasource.url=jdbc:h2:mem:testdb`

1.  **H2 인메모리 DB 사용:** 이 설정은 Spring Boot가 시작될 때, 외부의 실제 데이터베이스(RDS)에 연결하는 대신, **애플리케이션 내부 메모리에 임시 테스트용 데이터베이스를 만들어서 사용**하라는 의미
2.  **Health Check 통과:** 애플리케이션은 시작할 때 이 가짜 DB에 성공적으로 연결. 따라서 `/actuator/health` 상태 검사도 '성공(Healthy)'으로 응답 했던것
3.  **실제 API 요청 → 504 Timeout:** 하지만 ALB를 통해 실제 API 요청이 들어와서, 애플리케이션이 **실제 데이터(상품, 회원 정보 등)를 조회하려고 할 때**, 코드는 RDS가 아닌 텅 빈 H2 메모리에 쿼리를 날리게 되고, 이 과정에서 예상치 못한 오류가 발생하거나 DB 커넥션을 새로 맺으려다 무한 대기 상태에 빠져, 결국 ALB의 타임아웃 시간(60초)을 초과하여 `504 Gateway Timeout` 에러가 발생한 것

-----

### **최종 문제 현상**

  * **`504 Gateway Timeout`**: 로드 밸런서(ALB)를 통해 API를 호출하면, 서버가 응답하지 않아 시간 초과 에러가 발생한다.
  * **`Healthy` 상태**: 하지만 대상 그룹의 EC2 인스턴스들은 모두 `Healthy` 상태로, `/actuator/health` 상태 검사는 정상적으로 통과하고 있다.

### **결론: 진짜 문제의 본질**

문제의 본질은 \*\*"애플리케이션이 클라우드 환경에서 실제 데이터베이스(RDS)가 아닌, 로컬 테스트용 가짜 데이터베이스(H2 인메모리)를 사용하도록 설정되어 있었다"\*\*는 것

이로 인해, 애플리케이션 자체는 정상적으로 시작하고 가짜 DB에 연결하여 `Healthy` 상태를 유지했지만, 실제 데이터가 필요한 API 요청이 들어오자 RDS에 연결을 시도하다가 설정이 없어 실패하고 무한 대기 상태에 빠져 `504` 타임아웃을 유발했던 것

-----

### **최종 해결책: Spring 프로파일을 이용한 환경 분리**

이 문제를 근본적으로 해결하고, 다른 팀원들의 로컬 개발 환경까지 고려하는 가장 올바른 방법은 **Spring Boot의 '프로파일(Profiles)' 기능을 사용**하는 것
> 프로파일이란? Spring Boot에서 제공하는 것을 특정 환경(local, dev, prod 등)에 따라 다른 설정파일을 로드함.

- application-local.properties: 파일 이름만 정확히 만들고, 안에는 H2 관련 설정만 넣는다.
- application.properties: 클라우드(RDS) 관련 설정을 넣고, 맨 위에 spring.profiles.active=local 한 줄만 추가하여 로컬 개발자들이 아무 설정 없이 실행해도 H2가 켜지도록 배려해준다.

#### **1단계: `build.gradle` 의존성 추가**

RDS 및 Secrets Manager 연결에 필요한 라이브러리를 추가

```groovy
// 'Spring Cloud AWS'의 버전 목록표(BOM)를 import 합니다.
dependencyManagement {
	imports {
		// Spring Boot 3.x 버전에 맞는 Spring Cloud AWS의 BOM
		mavenBom "io.awspring.cloud:spring-cloud-aws-dependencies:3.1.1"
	}
}
dependencies {
    // ...
	implementation 'io.awspring.cloud:spring-cloud-aws-starter-secrets-manager'
    runtimeOnly 'com.mysql:mysql-connector-j'
    // ...
}
```

#### **2단계: 로컬 개발용 설정 파일 생성 (`application-local.properties`)**

`src/main/resources` 폴더에, 로컬에서만 사용할 H2 DB 설정을 담은 새 파일 생성

**`application-local.properties` 내용:**

```properties
# 'local' 프로파일 전용: H2 인메모리 DB 사용
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=
spring.jpa.hibernate.ddl-auto=create-drop
spring.h2.console.enabled=true
```

#### **3단계: 기본 설정 파일 수정 (`application.properties`)**

기존 `application.properties`의 내용을 **클라우드 배포용 설정**으로 완전히 교체하고, **기본 프로파일을 `local`로 지정**

**`application.properties` 내용:**

```properties
# 기본 프로파일은 'local'로 활성화 (로컬 개발자를 위함)
spring.profiles.active=local

# --- 아래는 'local'이 아닌 다른 프로파일(dev, prod)에서 사용될 설정 ---
spring.application.name=core

# AWS Secrets Manager 연동 설정
spring.config.import=aws-secretsmanager:tio/db/credentials

# DataSource 및 JPA 설정 (MySQL/RDS용)
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver
spring.jpa.hibernate.ddl-auto=update
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect

# ... (oauth, actuator 설정은 기존과 동일) ...
```

#### **4단계: 배포 스크립트 수정 (`scripts/start_server.sh`)**

EC2 서버에서 앱을 실행할 때, **`dev` 프로파일을 강제로 활성화**하도록 실행 명령어에 옵션을 추가합니다.

**`start_server.sh`의 마지막 실행 부분:**

```bash
# --spring.profiles.active=dev 옵션을 추가
nohup java -jar $DEPLOY_JAR --spring.profiles.active=dev >> /home/ec2-user/app/deploy.log 2>/home/ec2-user/app/deploy_err.log &
```

-----

**핵심 설정:**
`spring.config.import=aws-secretsmanager:tio/db/credentials`

Spring Boot가 시작될 때 AWS Secrets Manager에 접속해서 `tio/db/credentials` 라는 비밀을 찾아, 그 안에 있는 `host`, `port`, `username`, `password`, `dbname` 같은 값들을 자동으로 `spring.datasource.*` 속성에 주입해줌.  
더 이상 코드에 민감한 정보를 적을 필요가 없다.