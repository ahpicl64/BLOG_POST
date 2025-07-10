# AWS CLI 및 SSM 플러그인  설정

로컬 PC에서 SSM 포트 포워딩, 즉 AWS의 프라이빗한 서버와 안전한 '비밀 통로'를 만들기 위해서는, 이 통로를 만들고 관리할 두 가지 핵심 도구가 로컬 컴퓨터에 설치되어 있어야 한다.

- **AWS CLI (Command Line Interface):** 터미널에서 AWS 서비스를 제어하게 해주는 기본 도구.
- **Session Manager 플러그인:** AWS CLI가 SSM 세션을 시작하고, 포트 포워딩 같은 고급 기능을 사용하도록 돕는 필수 확장 프로그램.

---

### **1단계: AWS CLI 설치하기**

이미 설치되어 있다면 이 단계는 건너뛰어도 좋다. `aws --version` 명령어로 확인 가능하다. 
공식문서가 더 잘 정리되어있다.

https://docs.aws.amazon.com/ko_kr/cli/latest/userguide/getting-started-install.html

### **Windows 사용자:**

1. 아래 링크에서 64비트용 MSI 설치 관리자를 다운로드한다.
    - [AWS CLI MSI 설치 관리자 (64비트) 다운로드](https://www.google.com/search?q=https://awscli.amazonaws.com/AWSCLIV2.msi)
2. 다운로드한 `AWSCLIV2.msi` 파일을 실행한다.
3. 설치 마법사의 안내에 따라 **[Next]**를 누르고, 라이선스 동의에 체크한 뒤 설치를 완료한다.
4. 설치가 끝나면, 명령 프롬프트(cmd)나 PowerShell을 새로 열고 아래 명령어를 입력하여 설치를 확인한다.
    
    ```bash
    aws --version
    ```
    

### **macOS 사용자:**

1. 아래 링크에서 그래픽 설치 관리자(.pkg)를 다운로드한다.
    - [AWS CLI macOS 설치 관리자(.pkg) 다운로드](https://www.google.com/search?q=https://awscli.amazonaws.com/AWSCLIV2.pkg)
2. 다운로드한 `AWSCLIV2.pkg` 파일을 실행한다.
3. 화면의 안내에 따라 설치를 진행한다. (보안 설정에 따라 관리자 암호가 필요할 수 있다.)
4. 설치가 끝나면, 터미널(Terminal)을 새로 열고 아래 명령어를 입력하여 설치를 확인한다.
    
    ```bash
    aws --version
    ```
    

---

### **2단계: Session Manager 플러그인 설치하기**

AWS CLI가 SSM 기능을 제대로 사용하기 위한 필수 플러그인이다.

### **Windows 사용자:**

1. 아래 링크에서 설치 프로그램을 다운로드한다.
    - [Session Manager 플러그인 설치 프로그램 (Windows) 다운로드](https://www.google.com/search?q=https://s3.amazonaws.com/session-manager-downloads/plugin/latest/windows/SessionManagerPluginSetup.exe)
2. 다운로드한 `SessionManagerPluginSetup.exe` 파일을 실행하고, 화면의 안내에 따라 설치를 완료한다.
3. 설치가 끝나면, 명령 프롬프트(cmd)나 PowerShell을 새로 열고 아래 명령어를 입력하여 설치를 확인한다.
    
    ```bash
    session-manager-plugin
    ```
    
    - `The Session Manager plugin is installed successfully...` 와 같은 메시지가 보이면 성공이다.

### **macOS 사용자:**

---

### **1단계: 설치 파일 다운로드 (터미널 명령어)**

터미널을 열고, 아래 `curl` 명령어를 그대로 복사하여 실행합니다. 이 명령어는 공식 다운로드 링크에서 `.pkg` 설치 파일을 현재 위치에 다운로드합니다.

```bash
curl "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/mac/session-manager-plugin.pkg" -o "session-manager-plugin.pkg"
```

### **2단계: 설치 프로그램 실행 (터미널 명령어)**

다운로드가 완료되면, 바로 이어서 아래 명령어를 터미널에 실행합니다. 이 명령어는 다운로드한 `.pkg` 파일을 시스템에 설치하는 과정이며, 관리자 권한이 필요하여 `sudo`를 사용합니다. (macOS 로그인 암호를 입력해야 할 수 있습니다.)

```bash
sudo installer -pkg session-manager-plugin.pkg -target /
```

### **3단계: 설치 확인**

설치가 완료되면, 터미널을 새로 열거나 현재 터미널에서 아래 명령어를 입력하여 플러그인이 성공적으로 설치되었는지 확인합니다.

```bash
session-manager-plugin
```

- **성공 메시지:** `The Session Manager plugin is installed successfully...` 와 같은 메시지가 보이면 모든 과정이 성공적으로 완료된 것입니다.

---

### **참고: 더 간단한 방법 (Homebrew 사용 시)**

만약 로컬 PC에 **Homebrew**라는 패키지 관리자가 설치되어 있다면, 아래 단 한 줄의 명령어로 훨씬 더 간단하게 설치할 수 있습니다. (많은 개발자들이 이 방법을 선호합니다.)

```bash
brew install --cask session-manager-plugin
```

---

---

### **3단계 (최초 1회): AWS 자격 증명 설정**

이제 설치된 AWS CLI에 "나는 누구인가"를 알려주어야 한다. AWS 키가 필요한데.  
자신의 `IAM 계정으로 들어가 키 발급받기`해야한다.

1. 터미널(명령 프롬프트, PowerShell)에 아래 명령어를 입력한다.
    
    ```bash
    aws configure
    ```
    
2. 화면에 나타나는 프롬프트에 따라 순서대로 값을 입력한다.
    - **AWS Access Key ID:** 발급받았던 액세스 키 ID를 붙여넣고 엔터
    - **AWS Secret Access Key:** 비밀 액세스 키를 붙여넣고 엔터
    - **Default region name:** `ap-northeast-2` 를 입력하고 엔터
    - **Default output format:** `json` 을 입력하고 엔터