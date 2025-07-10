# SSM을 활용한 개발환경(로컬 - mySQL workbench) 에서 RDS(AWS DB) 사용하기

로컬 PC에서  AWS에서 DB를 위해 생성한 `TIO-DB-SG` 보안 그룹 규칙을 계속 수정하는 것이 번거롭고 `보안상 좋지 않다고 판단`될 때, 사용할 수 있는 훨씬 더 안전하고 전문가적인 접근 방법이 바로 **SSM 세션 관리자의 '포트 포워딩' 기능**

이것은 "내 PC의 특정 포트로 들어오는 요청을, SSM의 안전한 암호화 터널을 통해 저 멀리 프라이빗 서브넷에 있는 RDS 데이터베이스의 3306 포트로 전달해줘" 라고 설정하는 방식입

---

### **SSM 포트 포워딩을 이용한 DB 접속 방법**

이 방법을 사용하면 더 이상 **DB 보안 그룹(`TIO-DB-SG`)에 내 IP 주소를 추가할 필요가 전혀 없다**

### **선행 조건**

1. **내 로컬 PC에 `AWS CLI`가 설치되어 있어야 함**
    1. CLI설치 이후  아래 명령어를 통해서 내 계정정보를 등록해줘야한다.
        
        ```bash
        aws configure
        # 위 명령어를 입력하면 순차적으로
        AWS Access Key ID
        AWS Secrets Access ID
        Default region name
        Default output format 
        ```
        
    2. 위 네 정보를 입력하면된다. access key는 개인 AWS IAM 콘솔로 들어가 발급받아주면되고, region은 `ap-northeast-2` , format은 `json` 으로 입력해주면된다.
2. **`session-manager-plugin`이 내 로컬 PC에 설치되어 있어야 함** 
    
    ```bash
    # Homebrew로 설치
    brew install --cask session-manager-plugin
    
    # 설치 확인
    session-manager-plugin
    ```
    
3. 이 방법을 사용할 IAM 사용자는 **`AmazonSSMManagedInstanceCore`** 권한과, 
**SSM 포트 포워딩에 필요한 추가적인 IAM 권한**을 가지고 있어야 함
    1. 추가적인 권한 정책은 생성 후 아래 json을 붙여넣으면된다
        
        ```bash
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": "ssm:StartSession",
                    "Resource": [
                        "arn:aws:ec2:ap-northeast-2:ACCOUNT_ID:instance/*",
                        "arn:aws:ssm:ap-northeast-2:ACCOUNT_ID:document/AWS-StartPortForwardingSessionToRemoteHost"
                    ]
                }
            ]
        }
        ```
        
        `ACCOUNT_ID` 에 는 본인의 12자리 ID를 넣어야한다.
        

### **실행 방법**

1. EC2 인스턴스 ID 확인:
    
    VPC 내에 있는 아무 EC2 인스턴스(예: TIO-Spring-Server 중 하나)의 인스턴스 ID를 복사
     (예: i-012345abcdefgh) 이 인스턴스는 RDS로 가는 '징검다리' 역할을 하게 됨
    
2. RDS 엔드포인트 주소 확인:
    
    RDS 콘솔에서 tio-database의 엔드포인트 주소를 복사
    
3. 터미널에서 포트 포워딩 시작:Bash
    
    내 로컬 PC의 터미널(명령 프롬프트, PowerShell 등)을 열고 아래 명령어를 실행
    
    ```bash
    aws ssm start-session \
        --target i-012345abcdefgh \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters '{"host":["YOUR_RDS_ENDPOINT_ADDRESS"],"portNumber":["3306"],"localPortNumber":["3307"]}'
    ```
    
    - `i-012345abcdefgh`: 1단계에서 복사한 '징검다리' EC2 인스턴스의 ID로 교체
    - `YOUR_RDS_ENDPOINT_ADDRESS`: 2단계에서 복사한 실제 RDS 엔드포인트 주소로 교체
4. **명령어 실행 후:**
    - 터미널은 "Waiting for connections..." 와 같은 메시지를 보여주며 **대기 상태**가 되고. **이 터미널 창을 끄면 안 된다.** 이 창이 바로 '안전한 터널' 그 자체이다
5. **DB 클라이언트로 접속:**
    - 이제 MySQL Workbench나 DBeaver 같은 DB 클라이언트를 켠다
    - 접속 정보에 아래와 같이 입력
        - **Host:** `127.0.0.1` (또는 `localhost`)
        - **Port:** `3307`  (3307로 한 이유는 mySql 서버가 3306과 동일한 포트를 점유한다.)
        - **Username:** `admin` (RDS 마스터 사용자 이름)
        - **Password:** Secrets Manager에 저장해 둔 실제 비밀번호
    - **[Connect]** 버튼을 누릅니다.

### **동작 원리**

1. DB 클라이언트는 내 PC의 `localhost:3306`으로 접속을 시도
2. 이 접속 요청은 터미널에서 실행 중인 SSM 세션 관리자에게 가로채임
3. SSM은 이 요청을 안전하게 암호화하여, '징검다리' 역할을 하는 EC2 인스턴스로 보냄
4. EC2 인스턴스는 이 요청을 받아, 프라이빗 서브넷 내부에서 실제 RDS 데이터베이스의 3307 포트로 전달

결과적으로, 내 PC와 RDS 데이터베이스 사이에 **SSM을 통한 안전한 암호화 터널**이 뚫리게 되어, 
보안 그룹에 구멍을 내지 않고도 안전하게 DB에 접속할 수 있게 된다
이것이 실제 운영 환경에서 DB를 관리할 때 사용하는 가장 표준적인 방법 중 하나임

## 1. 포트 포워딩 오류 해결

첫 번째 오류 Cannot perform start session: listen tcp 127.0.0.1:3306: bind: address already in use는 3306 포트가 이미 사용 중이라는 뜻

### 해결 방법:

```bash

## macOS에서 포트 사용 확인

### 1. lsof 명령어 (가장 상세한 정보)
# 3306 포트 사용 중인 프로세스 확인
lsof -i :3306

# 더 자세한 정보
lsof -i :3306 -P -n

### 2. netstat 명령어
bash
# 3306 포트 리스닝 상태 확인
netstat -an | grep 3306

# TCP 연결만 확인
netstat -an | grep :3306

### 3. ss 명령어 (최신 방법)
bash
# 3306 포트 상태 확인
ss -tulpn | grep :3306

### 4. 프로세스 종료 (필요시)
bash
# 프로세스 ID 확인 후 종료
lsof -ti :3306
kill -9 $(lsof -ti :3306)

# 또는 특정 프로세스만 종료
sudo kill -9 <PID>

### 5. MySQL/MariaDB 확인
3306은 MySQL의 기본 포트이므로:
bash
# MySQL 프로세스 확인
ps aux | grep mysql
# Homebrew로 설치된 MySQL 확인
brew services list | grep mysql
# MySQL 중지 (필요시)
brew services stop mysql

# 2. 다른 포트 사용 (예: 3307)
aws ssm start-session \
--target i-03b30c82b150d9ccf \
--document-name AWS-StartPortForwardingSessionToRemoteHost \
--parameters '{"host":["[tio-db.cjgee4eswvls.ap-northeast-2.rds.amazonaws.com](http://tio-db.cjgee4eswvls.ap-northeast-2.rds.amazonaws.com/)"],"portNumber":["3306"],"localPortNumber":["3307"]}' \
--region ap-northeast-2
```

## 2. 일반 세션 연결 문제

AWS API 호출은 성공했고 SessionId도 받았지만, Session Manager 플러그인이 WebSocket 연결을 시작하지 못하고 있음

### 해결 방법:

```bash
# Session Manager 플러그인 완전 재설치

sudo rm -rf /usr/local/sessionmanagerplugin
sudo rm -f /usr/local/bin/session-manager-plugin

# 최신 버전 수동 설치

curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac/sessionmanager-bundle.zip" -o "sessionmanager-bundle.zip"
unzip sessionmanager-bundle.zip
sudo ./sessionmanager-bundle/install -i /usr/local/sessionmanagerplugin -b /usr/local/bin/session-manager-plugin

# 실행 권한 확인

sudo chmod +x /usr/local/bin/session-manager-plugin

# 설치 확인

session-manager-plugin
```

## 3. Spring Boot 설정 수정

포트를 3307로 변경했다면 Spring Boot 설정도 수정:

```bash
# application-local.properties

spring.datasource.url=jdbc:mysql://localhost:3307/tryiton_db?serverTimezone=Asia/Seoul
```

## 4. 실행 순서

```bash
# 1. 포트 포워딩 (3307 포트 사용)

aws ssm start-session \
    --target i-03b30c82b150d9ccf \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"host":"~~~~ rds.amazonaws.com","portNumber":"3306","localPortNumber":"3307"}' \
    --region ap-northeast-2

An error occurred (InvalidParameters) when calling the StartSession operation: Parameter "host" has value "[tio-db.cjgee4eswvls.ap-northeast-2.rds.amazonaws.com](http://tio-db.cjgee4eswvls.ap-northeast-2.rds.amazonaws.com/)" not matching "^[^,$^&\(\)!;'"<>\`{}\[\]\|#=]{3,}$".
aws ssm start-session \
    --target i-03b30c82b150d9ccf \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters '{"host":"~~~~ rds.amazonaws.com","portNumber":"3306","localPortNumber":"3307"}' \
    --region ap-northeast-2

Parameter validation failed:
Invalid type for parameter Parameters.host, value: tio-db.cjgee4eswvls.ap-northeast-2.rds.amazonaws.com, type: <class 'str'>, valid types: <class 'list'>, <class 'tuple'>
Invalid type for parameter Parameters.portNumber, value: 3306, type: <class 'str'>, valid types: <class 'list'>, <class 'tuple'>
Invalid type for parameter Parameters.localPortNumber, value: 3307, type: <class 'str'>, valid types: <class 'list'>, <class 'tuple'>
# 2. Spring Boot 실행 (다른 터미널에서)

./gradlew bootRun --args='--spring.profiles.active=local'

가장 중요한 것: 3306 포트 대신 3307 포트를 사용하고, Session Manager 플러그인을 완전히 재설치하세요.
```

mysqld가 계속 3306 포트를 점유하고 죽여도 다시 살아나는 것은 자동 재시작 서비스로 등록되어 있기 때문

## 원인 및 해결 방법

### 1. Homebrew 서비스로 등록된 경우

```bash
# MySQL 서비스 상태 확인

brew services list | grep mysql

# MySQL 서비스 완전 중지

brew services stop mysql

# 자동 시작 비활성화

brew services disable mysql
```

### 2. macOS launchd로 등록된 경우

```bash
# launchd 서비스 확인

launchctl list | grep mysql

# 서비스 언로드 (완전 중지)

sudo launchctl unload -w /Library/LaunchDaemons/com.oracle.oss.mysql.mysqld.plist

# 또는 사용자 레벨에서

launchctl unload ~/Library/LaunchAgents/homebrew.mxcl.mysql.plist
```

### 3. 시스템 MySQL 확인

```bash
bash
# 시스템에 설치된 MySQL 확인

which mysql
whereis mysql

# MySQL 설정 파일 확인

ls -la /etc/mysql/
ls -la /usr/local/etc/
```

### 4. 프로세스 완전 종료

```bash
# MySQL 관련 모든 프로세스 확인

ps aux | grep mysql

# 강제 종료

sudo pkill -f mysql
sudo killall mysqld

# 포트 재확인

lsof -i :3306
```

가장 확실한 방법: brew services stop mysql && brew services disable mysql 명령어를 사용한다