# DEVOPS 계획

## 자동화 중심의 DevOps 환경 구성 가이드

프로젝트의 기술 스택(백엔드, 프론트엔드, ML)이 명확히 분리되어 있으므로, 각 구성 요소를 독립적으로 개발, 빌드, 배포할 수 있는 **MSA(마이크로서비스 아키텍처)**에 최적화된 DevOps 환경을 구축하는 것이 핵심입니다. Docker와 Kubernetes를 사용하면 이를 효과적으로 달성할 수 있습니다.

### 1. 일반적인 DevOps 환경 구성 (공통)

모든 프로젝트에 적용할 수 있는 표준적이고 자동화된 파이프라인 구성입니다.

### **가. 소스 코드 관리 (Source Code Management)**

- **도구**: `Git` (GitHub, GitLab 등)
- **전략**:
    - `main`(또는 `master`): 최종 배포 가능한 안정 버전의 코드만 유지합니다.
    - `develop`: 개발의 중심이 되는 브랜치로, 기능 개발이 완료되면 `develop`으로 병합(Merge)합니다.
    - `feature/*`: 각 기능 단위로 브랜치를 생성하여 개발을 진행합니다. (`feature/login`, `feature/avatar-rendering` 등)
    - **자동화 연동**: `develop`이나 `main` 브랜치에 코드가 Push/Merge 될 때 CI/CD 파이프라인이 자동으로 실행되도록 Webhook을 설정합니다.

### **나. 컨테이너화 (Containerization)**

- **도구**: `Docker`
- **구성**:
    1. **`Dockerfile` 작성**: 3개의 서비스 각각에 대한 `Dockerfile`을 작성합니다.
        - **Spring Boot**: JDK 기반 이미지 위에서 `jar` 파일을 실행하는 Dockerfile
        - **React**: Nginx와 같은 웹서버를 사용하여 빌드된 정적 파일(`build` 폴더)을 서빙하는 Dockerfile
        - **FastAPI**: Python 기반 이미지 위에서 `requirements.txt`로 의존성을 설치하고 FastAPI 서버를 실행하는 Dockerfile
    2. **`docker-compose.yml` 작성**: 로컬 개발 환경에서 3개의 서비스와 DB(e.g., PostgreSQL, MySQL)를 한 번에 실행하고 테스트할 수 있도록 `docker-compose.yml`을 구성합니다. 개발 효율성이 크게 향상됩니다.

### **다. CI/CD 파이프라인 (지속적 통합/배포)**

- **도구**: `GitHub Actions` (가장 접근성이 좋고 GitHub와 완벽히 연동됨), Jenkins
- **핵심 파이프라인 (CI - Continuous Integration)**: `develop` 브랜치에 코드가 Push 될 때마다 실행됩니다.
    1. **코드 체크아웃 (Checkout)**: Git 리포지토리의 최신 코드를 가져옵니다.
    2. **빌드 및 테스트 (Build & Test)**:
        - **Spring Boot**: `./gradlew build` 또는 `mvn package`로 빌드 및 단위/통합 테스트 실행
        - **React**: `npm install`, `npm test`, `npm run build`로 의존성 설치, 테스트, 최종 빌드
        - **FastAPI**: `pip install -r requirements.txt`, `pytest` 등으로 의존성 설치 및 테스트 실행
    3. **정적 코드 분석 (Linting & Static Analysis)**: 코드 품질을 일관되게 유지하고 잠재적 버그를 찾습니다. (e.g., SonarQube, ESLint)
    4. **도커 이미지 빌드 및 푸시 (Build & Push Docker Image)**:
        - CI가 성공적으로 완료되면, 해당 서비스의 Dockerfile을 사용하여 도커 이미지를 빌드합니다.
        - 빌드된 이미지에 Git 커밋 해시(Commit Hash)나 빌드 시간으로 태그를 지정합니다. (`my-backend:1.0.1-a1b2c3d`)
        - `Docker Hub`나 `GCP Artifact Registry`, `AWS ECR` 같은 **컨테이너 레지스트리**에 이미지를 Push합니다.

### **라. 배포 자동화 (CD - Continuous Deployment) & 오케스트레이션**

- **도구**: `Kubernetes (K8s)`
- **구성**:
    1. **쿠버네티스 매니페스트(Manifest) 작성**:
        - 각 서비스(Deployment), 내부 통신(Service), 외부 노출(Ingress) 등을 YAML 파일로 정의합니다. 이 파일들도 Git 리포지토리에서 코드로 관리합니다(**GitOps**).
    2. **배포 파이프라인**:
        - CI 파이프라인에서 새 도커 이미지를 레지스트리에 Push한 후, 배포 파이프라인이 실행됩니다.
        - 파이프라인은 Git에 저장된 쿠버네티스 매니페스트 파일의 이미지 태그를 새로 빌드된 이미지 태그로 자동 변경합니다.
        - `kubectl apply -f <매니페스트 폴더>` 명령을 통해 변경사항을 쿠버네티스 클러스터에 적용하여 무중단 업데이트를 수행합니다.
        - **고급**: `ArgoCD`나 `Flux` 같은 GitOps 도구를 사용하면, Git 리포지토리의 매니페스트 변경을 감지하여 클러스터에 자동으로 동기화해주므로 배포 과정이 훨씬 더 안정적이고 자동화됩니다.

---

### 2. '쇼핑 미리보기' 프로젝트 특화 DevOps 환경 (MLOps)

위의 일반적인 환경을 기반으로, 머신러닝 모델의 특성을 고려한 MLOps(Machine Learning Operations) 요소를 추가해야 합니다.

### **가. 아키텍처 흐름과 특화 과제**

- **사용자 흐름**: React(클라이언트) → Spring Boot(API 서버) → FastAPI(ML 모델 서빙)
- **주요 과제**:
    - **ML 모델 관리**: 아바타 생성 모델, 가상 피팅 렌더링 모델 등은 코드뿐만 아니라 '데이터'와 '학습된 가중치(artifact)'가 함께 관리되어야 합니다.
    - **GPU 자원 활용**: 2D/3D 렌더링은 CPU만으로 처리하기에 매우 느릴 수 있습니다. ML 서비스는 GPU를 효율적으로 사용해야 합니다.
    - **대용량 데이터 처리**: 사용자가 업로드하는 전신 사진, 크롤링한 의류 이미지 등 대용량 파일을 저장하고 처리하는 방법이 필요합니다.

### **나. MLOps 파이프라인 구성**

일반 CI/CD에 아래와 같은 ML 특화 단계를 추가합니다.

1. **실험 관리 및 모델 레지스트리**:
    - **도구**: `MLflow`, `Weights & Biases`
    - **역할**:
        - **실험 추적**: 모델을 학습시킬 때마다 사용된 파라미터, 데이터셋 버전, 성능 지표(e.g., 정확도, 손실)를 모두 기록하여 어떤 실험이 최고의 성능을 냈는지 추적합니다.
        - **모델 저장 및 버전 관리**: 검증이 완료된 모델 파일(e.g., `.pt`, `.h5`)을 **모델 레지스트리**에 "Staging" 또는 "Production" 같은 태그와 함께 버전별로 저장합니다. 코드가 아닌 **'모델'을 버전 관리**하는 것이 핵심입니다.
2. **ML 모델 CI/CD 파이프라인**:
    - **트리거**: 새로운 학습 코드가 Push 되거나, 새로운 학습 데이터가 준비되었을 때 파이프라인이 실행됩니다.
    - **과정**:
        1. 데이터 유효성 검사 (새 데이터가 학습에 적합한지 확인)
        2. 모델 학습 및 평가 (새 모델 학습 후, 기존 Production 모델과 성능 비교)
        3. 성능 향상 시, 새 모델을 모델 레지스트리에 'Production'으로 등록
        4. (CD 시작) **새 모델을 포함하는 FastAPI Docker 이미지를 새로 빌드**하여 컨테이너 레지스트리에 Push
        5. 쿠버네티스 클러스터에 새 버전의 ML 서비스 배포

### **다. 인프라 특화 구성**

1. **GPU 자원 할당 (Kubernetes)**:
    - ML 렌더링을 수행할 FastAPI 서비스의 쿠버네티스 `Deployment.yaml` 파일에 GPU 리소스 요청을 명시해야 합니다.
    - `spec: containers: - name: ml-rendering-service image: my-registry/avatar-renderer:1.2.0 resources: limits: nvidia.com/gpu: 1 # 이 Pod에 GPU 1개를 할당`
2. **데이터 저장 및 관리**:
    - **도구**: `Amazon S3`, `Google Cloud Storage` 같은 오브젝트 스토리지
    - **흐름**: 사용자가 사진을 업로드하면, React 앱이 Spring Boot API로 파일을 전송합니다. Spring Boot 서버는 파일을 직접 저장하는 대신, S3 같은 스토리지에 업로드하고 해당 파일에 접근할 수 있는 URL만 DB에 저장합니다. 이후 FastAPI 서비스는 이 URL을 전달받아 이미지를 다운로드하고 처리합니다. 이렇게 하면 서버의 부담이 줄고 확장이 용이합니다.
3. **자동 확장 (Auto-Scaling)**:
    - 가상 피팅 요청이 갑자기 몰릴 경우, 서비스가 느려지거나 다운될 수 있습니다.
    - 쿠버네티스의 `HPA (Horizontal Pod Autoscaler)`를 사용하여 GPU나 CPU 사용량이 일정 수준 이상으로 올라가면, FastAPI 서비스의 Pod 개수를 자동으로 늘려 트래픽을 분산 처리하도록 설정합니다. 사용량이 줄면 다시 Pod 개수를 줄여 비용을 최적화합니다.

### 최종 흐름 요약

```
[개발자]         [GitHub]         [GitHub Actions CI]        [Container Registry]        [Kubernetes (ArgoCD)]
코드 Push  --->  Webhook  --->   1. 빌드 & 테스트         --->   Docker 이미지 저장   --->  Git 변경 감지 & 자동 배포
(Git)          (자동 트리거)       2. Docker 이미지 빌드                                        (무중단 업데이트)
                                                                                            (Auto-Scaling)

```

이와 같이 환경을 구성하면, 개발자는 `Git`에 코드를 푸시하는 것만으로 빌드, 테스트, 배포 전 과정이 자동으로 처리되는 효율적인 개발 문화를 만들 수 있습니다. 특히 머신러닝 프로젝트의 복잡한 모델 관리까지 파이프라인에 통합하여 안정적이고 재현 가능한 서비스 운영이 가능해집니다.

### 1. MLOps 및 인프라 강화 (가장 큰 투자 영역)

앞서 설명드린 DevOps 환경을 AWS의 강력한 관리형 서비스(Managed Service)로 구축하여, 팀이 인프라 관리에 들이는 시간을 줄이고 서비스 개발에만 집중하도록 만듭니다.

- **컨테이너 오케스트레이션**: **Amazon EKS (Elastic Kubernetes Service)**
    - 직접 Kubernetes 클러스터를 설치하고 관리하는 것은 매우 복잡합니다. EKS를 사용하면 AWS가 컨트롤 플레인(마스터 노드)을 전적으로 관리해주므로 팀은 워커 노드와 애플리케이션 관리에만 집중하면 됩니다. 크레딧으로 EKS 클러스터 운영 비용을 충분히 감당할 수 있습니다.
- **CI/CD 파이프라인**: **AWS CodePipeline (CodeBuild, CodeDeploy)** 또는 **GitHub Actions + ECR/EKS 연동**
    - `AWS CodePipeline`은 소스코드 변경부터 빌드, 테스트, 배포까지 모든 과정을 자동화하는 완전 관리형 서비스입니다. GitHub 리포지토리와 쉽게 연동됩니다.
    - `Amazon ECR (Elastic Container Registry)`: 빌드된 Docker 이미지를 저장하는 프라이빗 레지스트리입니다. EKS와의 연동 및 IAM을 통한 권한 관리가 매우 용이하여 보안성이 높습니다.
- **머신러닝 플랫폼**: **Amazon SageMaker (강력 추천)**
    - **FastAPI를 직접 EC2/EKS에서 운영하는 것보다 훨씬 효율적이고 강력한 방법입니다.** SageMaker는 MLOps의 모든 단계를 위한 통합 도구를 제공합니다.
    - **SageMaker Studio**: Jupyter Notebook 기반의 통합 개발 환경으로, 여기서 데이터 전처리, 모델 학습, 실험 추적을 모두 수행할 수 있습니다. (`MLflow` 같은 도구의 역할을 상당 부분 대체)
    - **SageMaker Training**: 클릭 몇 번으로 분산 학습 작업을 시작할 수 있습니다. 대용량 데이터로 모델을 학습시킬 때 필수적입니다.
    - **SageMaker Endpoints**: 학습된 모델을 배포하는 가장 쉬운 방법입니다. API 엔드포인트를 생성해주며, **트래픽에 따라 자동으로 인스턴스 수를 조절하는 Auto-Scaling 기능**이 내장되어 있습니다. GPU 인스턴스도 쉽게 선택할 수 있습니다.
    - **결론**: 팀에서 CV/ML을 담당하는 성광님이 `SageMaker`를 활용하면, 모델 성능 개선에만 집중할 수 있는 환경이 만들어집니다. **크레딧의 상당 부분을 SageMaker 학습 및 엔드포인트 호스팅에 사용하는 것을 가장 추천합니다.**

### 2. 대용량 데이터 관리 최적화

사용자의 사진, 의류 이미지 등 핵심 데이터를 효율적으로 관리하는 것은 서비스의 성패를 좌우합니다.

- **객체 스토리지**: **Amazon S3 (Simple Storage Service)**
    - 사용자가 업로드하는 모든 이미지(전신 사진, 의류 사진)는 S3에 저장하는 것이 표준입니다. 거의 무한한 확장성과 높은 내구성(99.999999999%)을 자랑하며 비용도 매우 저렴합니다.
- **데이터베이스**: **Amazon RDS (Relational Database Service) 또는 Aurora**
    - 사용자 정보, 상품 메타데이터 등 정형 데이터는 RDS를 통해 관리형 데이터베이스(PostgreSQL, MySQL 등)에 저장합니다. RDS는 백업, 복제, 패치 등 운영 부담을 크게 줄여줍니다.
    - `Amazon Aurora`는 RDS보다 더 높은 성능과 가용성을 제공하는 AWS의 자체 개발 데이터베이스로, 크레딧이 있다면 초반부터 고려해볼 만합니다.
- **데이터 자동 전처리**: **AWS Lambda**
    - **S3와 Lambda를 연동하는 것은 매우 강력한 패턴입니다.**
    - **흐름**: 사용자가 S3에 이미지를 업로드(`Event`) → Lambda 함수가 자동으로 실행(`Trigger`) → Lambda가 이미지 사이즈를 통일하거나, 얼굴 영역을 감지하는 등 간단한 전처리를 수행 → 처리된 결과를 다른 S3 버킷에 저장하거나 데이터베이스에 기록.
    - 이 서버리스(Serverless) 아키텍처는 비용 효율적이며 확장성이 뛰어납니다.
- **콘텐츠 전송 네트워크 (CDN)**: **Amazon CloudFront**
    - 전 세계 사용자에게 React 애플리케이션과 S3의 이미지를 빠르게 전송하기 위해 사용합니다. 사용자 경험(로딩 속도)을 크게 향상시키고, S3 데이터 전송 비용을 절감하는 효과도 있습니다.

### 3. 비용 관리 및 모니터링

$1000 크레딧을 소중하게 사용하려면 지출을 추적하고 계획해야 합니다.

- **AWS Cost Explorer**: 시간 경과에 따른 지출을 시각적으로 분석하고 추적합니다.
- **AWS Budgets**: 예산 한도를 설정하고, 지출이 예상치를 초과할 것 같으면 이메일 등으로 알림을 받도록 설정하여 크레딧을 예상치 못하게 소진하는 것을 방지합니다.
- **Trusted Advisor**: AWS 모범 사례를 기반으로 비용 절감, 성능 향상, 보안 강화를 위한 권장 사항을 제공합니다.

---

### **추천 로드맵**

1. **Phase 1: 기반 구축 (1~2주차)**
    - `IAM`으로 개발자별 권한 설정.
    - `S3` 버킷 생성하여 이미지 저장소 마련.
    - `RDS` 인스턴스를 생성하여 데이터베이스 환경 구축.
    - `EKS` 클러스터를 생성하고, Spring Boot / React 애플리케이션을 수동으로 배포하여 기본 통신이 되는지 확인.
2. **Phase 2: ML 파이프라인 핵심 구축 (3~4주차)**
    - **`SageMaker Studio`를 사용하여 첫 번째 아바타 생성/렌더링 모델을 학습시키고 실험을 추적.**
    - 학습된 모델을 **`SageMaker Endpoint`로 배포**하여 API를 생성.
    - Spring Boot 백엔드가 이 SageMaker Endpoint를 호출하도록 API 연동.
    - `GitHub Actions`와 `ECR`, `EKS`를 연동하여 기본적인 CI/CD 파이프라인 구축.
3. **Phase 3: 고도화 및 최적화 (5주차 이후)**
    - S3와 `Lambda`를 연동하여 이미지 업로드 시 자동 전처리를 구현.
    - `CloudFront`를 적용하여 웹 서비스 로딩 속도 개선.
    - `SageMaker Endpoint`와 `EKS`에 Auto-Scaling 정책을 적용하여 트래픽 변화에 대응.
    - `AWS Budgets`를 설정하여 비용 모니터링 시작.

이처럼 AWS 크레딧을 활용하면, 단순한 아이디어 구현을 넘어 **'프로덕션 레벨'의 안정성과 확장성을 갖춘 서비스를 개발하는 경험**을 쌓을 수 있습니다. 이는 팀의 기술적 역량을 보여주는 데 매우 큰 자산이 될 것입니다.