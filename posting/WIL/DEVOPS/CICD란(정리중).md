# CICD 구축시 일어나는 일

네, 아주 좋은 질문입니다. "개발자가 Push하면 그 뒤에 마법처럼 배포가 된다는데, 그 마법이 정확히 어떻게 일어나는가?"를 이해하는 것이 CI/CD의 핵심입니다.

그 과정을 한 단계씩, 매우 상세하게 설명해 드리겠습니다.

### **개발자가 `git push`를 누른 후 일어나는 일 (Step-by-Step)**

#### **Phase 1: GitHub Actions의 역할 (CI - 빌드 및 패키징)**

1.  **트리거 (Trigger):**
    * 개발자가 로컬 컴퓨터에서 코드를 수정한 뒤, `git push origin main` 명령어를 실행합니다.
    * 이 Push 이벤트를 GitHub 리포지토리의 `.github/workflows/deploy.yml` 파일이 감지하고, **자동으로 워크플로우를 시작**합니다.

2.  **가상 머신 준비 (Job Start):**
    * GitHub은 이 워크플로우를 실행하기 위해 클라우드에 깨끗한 가상 머신(Runner)을 하나 준비시킵니다.

3.  **코드 다운로드 (Checkout):**
    * 가상 머신은 가장 먼저 `main` 브랜치의 최신 코드를 GitHub 리포지토리로부터 다운로드합니다.

4.  **환경 설정 (Setup):**
    * 워크플로우 파일에 정의된 대로, 빌드에 필요한 환경을 구성합니다. (예: "이 프로젝트는 Java 17이 필요하니, Java 17을 설치해라")

5.  **빌드 (Build):**
    * 프로젝트에 맞는 빌드 명령어를 실행합니다.
    * **(Spring Boot의 경우):** `./gradlew build` 명령어를 실행하여, 모든 코드를 컴파일하고 테스트를 거친 뒤, 실행 가능한 **`application.jar` 파일 하나를 생성**합니다.

6.  **배포 패키지 압축 (Packaging):**
    * GitHub Actions는 배포에 필요한 모든 파일들을 하나의 `.zip` 파일로 묶습니다. 이 안에는 보통 다음 파일들이 포함됩니다.
        * `application.jar` (방금 빌드한 실행 파일)
        * `appspec.yml` (CodeDeploy를 위한 배포 설명서)
        * `scripts/` 폴더 (배포 스크립트들 - `start_server.sh` 등)

7.  **AWS에 인증 및 업로드 (Upload to S3):**
    * GitHub Actions는 미리 설정된 AWS 자격 증명(Access Key)을 사용하여 AWS에 로그인합니다.
    * 방금 만든 `.zip` 배포 패키지를 우리가 지정한 **S3 버킷에 업로드**합니다.

8.  **배포 명령 (Trigger CodeDeploy):**
    * S3 업로드가 완료되면, GitHub Actions는 AWS CodeDeploy에게 **"S3의 이 경로에 새 버전의 배포 패키지가 준비되었으니, 지금 바로 배포를 시작해!"** 라고 API를 통해 명령을 내립니다.
    * 이 시점에서 GitHub Actions의 주된 역할은 끝납니다.

---

#### **Phase 2: AWS CodeDeploy의 역할 (CD - 실제 서버 배포)**

9.  **배포 시작 (Deployment Start):**
    * CodeDeploy 서비스는 GitHub Actions로부터 명령을 받고, 지정된 배포 그룹(예: `TIO-Spring-ASG`에 속한 서버들)을 대상으로 배포 프로세스를 시작합니다.

10. **에이전트에 알림 (Notify Agents):**
    * CodeDeploy는 우리 Auto Scaling Group에 속한 **각 EC2 인스턴스에서 실행 중인 CodeDeploy 에이전트**에게 "새로운 배포 작업이 있다"고 알립니다.

11. **패키지 다운로드 (Download):**
    * 각 EC2의 CodeDeploy 에이전트는 S3 버킷에 접속하여, GitHub Actions가 올려둔 **새 버전의 `.zip` 배포 패키지를 다운로드**합니다.

12. **배포 설명서 실행 (`appspec.yml`):**
    * 에이전트는 다운로드한 패키지 안의 `appspec.yml` 파일을 읽고, 그 안에 적힌 **'Hooks'의 순서대로** 스크립트를 하나씩 실행합니다.
    * **`ApplicationStop`:** `scripts/stop_server.sh`를 실행하여, 현재 서버에서 실행 중인 **이전 버전의 Spring Boot 애플리케이션을 안전하게 중지**시킵니다.
    * **`Install`:** 다운로드한 `.zip` 파일의 압축을 풀고, 그 안의 내용물(`application.jar` 등)을 `appspec.yml`에 지정된 최종 목적지(예: `/home/ec2-user/app`)로 복사합니다.
    * **`ApplicationStart`:** `scripts/start_server.sh`를 실행하여, 방금 복사된 **새로운 `application.jar` 파일을 실행**시킵니다.

13. **상태 보고 (Report Status):**
    * 각 서버의 에이전트는 이 모든 과정의 성공 또는 실패 여부를 CodeDeploy 서비스에 보고합니다.

14. **배포 완료 (Deployment Finish):**
    * CodeDeploy는 모든 서버에서 배포가 성공적으로 완료된 것을 확인하고, 전체 배포 상태를 **'성공(Succeeded)'**으로 변경합니다. 만약 일부 서버에서 실패하면, 설정에 따라 자동으로 이전 버전으로 롤백을 시도할 수도 있습니다.

이 모든 과정이 끝나면, 개발자가 `git push`한 새로운 코드가 **단 한 번의 수동 개입 없이** 모든 운영 서버에 안전하게 반영되는 것입니다. 이것이 바로 CI/CD 파이프라인의 힘입니다.