## 자동화 중심의 DevOps 환경 구성 가이드

프로젝트의 기술 스택(백엔드, 프론트엔드, ML)이 명확히 분리되어 있으므로, 각 구성 요소를 독립적으로 개발, 빌드, 배포할 수 있는 **MSA(마이크로서비스 아키텍처)**에 최적화된 DevOps 환경을 구축하는 것이 핵심입니다. Docker와 Kubernetes를 사용하면 이를 효과적으로 달성할 수 있습니다.

### 1. 일반적인 DevOps 환경 구성 (공통)

모든 프로젝트에 적용할 수 있는 표준적이고 자동화된 파이프라인 구성입니다.

#### **가. 소스 코드 관리 (Source Code Management)**

* **도구**: `Git` (GitHub, GitLab 등)
* **전략**:
  * `main`(또는 `master`): 최종 배포 가능한 안정 버전의 코드만 유지합니다.
  * `develop`: 개발의 중심이 되는 브랜치로, 기능 개발이 완료되면 `develop`으로 병합(Merge)합니다.
  * `feature/*`: 각 기능 단위로 브랜치를 생성하여 개발을 진행합니다. (`feature/login`, `feature/avatar-rendering` 등)
  * **자동화 연동**: `develop`이나 `main` 브랜치에 코드가 Push/Merge 될 때 CI/CD 파이프라인이 자동으로 실행되도록 Webhook을 설정합니다.

#### **나. 컨테이너화 (Containerization)**

* **도구**: `Docker`
* **구성**:
    1. **`Dockerfile` 작성**: 3개의 서비스 각각에 대한 `Dockerfile`을 작성합니다.
        * **Spring Boot**: JDK 기반 이미지 위에서 `jar` 파일을 실행하는 Dockerfile
        * **React**: Nginx와 같은 웹서버를 사용하여 빌드된 정적 파일(`build` 폴더)을 서빙하는 Dockerfile
        * **FastAPI**: Python 기반 이미지 위에서 `requirements.txt`로 의존성을 설치하고 FastAPI 서버를 실행하는 Dockerfile
    2. **`docker-compose.yml` 작성**: 로컬 개발 환경에서 3개의 서비스와 DB(e.g., PostgreSQL, MySQL)를 한 번에 실행하고 테스트할 수 있도록 `docker-compose.yml`을 구성합니다. 개발 효율성이 크게 향상됩니다.

#### **다. CI/CD 파이프라인 (지속적 통합/배포)**

* **도구**: `GitHub Actions` (가장 접근성이 좋고 GitHub와 완벽히 연동됨), Jenkins
* **핵심 파이프라인 (CI - Continuous Integration)**: `develop` 브랜치에 코드가 Push 될 때마다 실행됩니다.
    1. **코드 체크아웃 (Checkout)**: Git 리포지토리의 최신 코드를 가져옵니다.
    2. **빌드 및 테스트 (Build & Test)**:
        * **Spring Boot**: `./gradlew build` 또는 `mvn package`로 빌드 및 단위/통합 테스트 실행
        * **React**: `npm install`, `npm test`, `npm run build`로 의존성 설치, 테스트, 최종 빌드
        * **FastAPI**: `pip install -r requirements.txt`, `pytest` 등으로 의존성 설치 및 테스트 실행
    3. **정적 코드 분석 (Linting & Static Analysis)**: 코드 품질을 일관되게 유지하고 잠재적 버그를 찾습니다. (e.g., SonarQube, ESLint)
    4. **도커 이미지 빌드 및 푸시 (Build & Push Docker Image)**:
        * CI가 성공적으로 완료되면, 해당 서비스의 Dockerfile을 사용하여 도커 이미지를 빌드합니다.
        * 빌드된 이미지에 Git 커밋 해시(Commit Hash)나 빌드 시간으로 태그를 지정합니다. (`my-backend:1.0.1-a1b2c3d`)
        * `Docker Hub`나 `GCP Artifact Registry`, `AWS ECR` 같은 **컨테이너 레지스트리**에 이미지를 Push합니다.

#### **라. 배포 자동화 (CD - Continuous Deployment) & 오케스트레이션**

* **도구**: `Kubernetes (K8s)`
* **구성**:
    1. **쿠버네티스 매니페스트(Manifest) 작성**:
        * 각 서비스(Deployment), 내부 통신(Service), 외부 노출(Ingress) 등을 YAML 파일로 정의합니다. 이 파일들도 Git 리포지토리에서 코드로 관리합니다(**GitOps**).
    2. **배포 파이프라인**:
        * CI 파이프라인에서 새 도커 이미지를 레지스트리에 Push한 후, 배포 파이프라인이 실행됩니다.
        * 파이프라인은 Git에 저장된 쿠버네티스 매니페스트 파일의 이미지 태그를 새로 빌드된 이미지 태그로 자동 변경합니다.
        * `kubectl apply -f <매니페스트 폴더>` 명령을 통해 변경사항을 쿠버네티스 클러스터에 적용하여 무중단 업데이트를 수행합니다.
        * **고급**: `ArgoCD`나 `Flux` 같은 GitOps 도구를 사용하면, Git 리포지토리의 매니페스트 변경을 감지하여 클러스터에 자동으로 동기화해주므로 배포 과정이 훨씬 더 안정적이고 자동화됩니다.

---

### 2. '쇼핑 미리보기' 프로젝트 특화 DevOps 환경 (MLOps)

위의 일반적인 환경을 기반으로, 머신러닝 모델의 특성을 고려한 MLOps(Machine Learning Operations) 요소를 추가해야 합니다.

#### **가. 아키텍처 흐름과 특화 과제**

* **사용자 흐름**: React(클라이언트) → Spring Boot(API 서버) → FastAPI(ML 모델 서빙)
* **주요 과제**:
  * **ML 모델 관리**: 아바타 생성 모델, 가상 피팅 렌더링 모델 등은 코드뿐만 아니라 '데이터'와 '학습된 가중치(artifact)'가 함께 관리되어야 합니다.
  * **GPU 자원 활용**: 2D/3D 렌더링은 CPU만으로 처리하기에 매우 느릴 수 있습니다. ML 서비스는 GPU를 효율적으로 사용해야 합니다.
  * **대용량 데이터 처리**: 사용자가 업로드하는 전신 사진, 크롤링한 의류 이미지 등 대용량 파일을 저장하고 처리하는 방법이 필요합니다.

#### **나. MLOps 파이프라인 구성**

일반 CI/CD에 아래와 같은 ML 특화 단계를 추가합니다.

1. **실험 관리 및 모델 레지스트리**:
    * **도구**: `MLflow`, `Weights & Biases`
    * **역할**:
        * **실험 추적**: 모델을 학습시킬 때마다 사용된 파라미터, 데이터셋 버전, 성능 지표(e.g., 정확도, 손실)를 모두 기록하여 어떤 실험이 최고의 성능을 냈는지 추적합니다.
        * **모델 저장 및 버전 관리**: 검증이 완료된 모델 파일(e.g., `.pt`, `.h5`)을 **모델 레지스트리**에 "Staging" 또는 "Production" 같은 태그와 함께 버전별로 저장합니다. 코드가 아닌 **'모델'을 버전 관리**하는 것이 핵심입니다.

2. **ML 모델 CI/CD 파이프라인**:
    * **트리거**: 새로운 학습 코드가 Push 되거나, 새로운 학습 데이터가 준비되었을 때 파이프라인이 실행됩니다.
    * **과정**:
        1. 데이터 유효성 검사 (새 데이터가 학습에 적합한지 확인)
        2. 모델 학습 및 평가 (새 모델 학습 후, 기존 Production 모델과 성능 비교)
        3. 성능 향상 시, 새 모델을 모델 레지스트리에 'Production'으로 등록
        4. (CD 시작) **새 모델을 포함하는 FastAPI Docker 이미지를 새로 빌드**하여 컨테이너 레지스트리에 Push
        5. 쿠버네티스 클러스터에 새 버전의 ML 서비스 배포

#### **다. 인프라 특화 구성**

1. **GPU 자원 할당 (Kubernetes)**:
    * ML 렌더링을 수행할 FastAPI 서비스의 쿠버네티스 `Deployment.yaml` 파일에 GPU 리소스 요청을 명시해야 합니다.

    * ```yaml
      spec:
        containers:
        - name: ml-rendering-service
          image: my-registry/avatar-renderer:1.2.0
          resources:
            limits:
              nvidia.com/gpu: 1 # 이 Pod에 GPU 1개를 할당
      ```

2. **데이터 저장 및 관리**:
    * **도구**: `Amazon S3`, `Google Cloud Storage` 같은 오브젝트 스토리지
    * **흐름**: 사용자가 사진을 업로드하면, React 앱이 Spring Boot API로 파일을 전송합니다. Spring Boot 서버는 파일을 직접 저장하는 대신, S3 같은 스토리지에 업로드하고 해당 파일에 접근할 수 있는 URL만 DB에 저장합니다. 이후 FastAPI 서비스는 이 URL을 전달받아 이미지를 다운로드하고 처리합니다. 이렇게 하면 서버의 부담이 줄고 확장이 용이합니다.

3. **자동 확장 (Auto-Scaling)**:
    * 가상 피팅 요청이 갑자기 몰릴 경우, 서비스가 느려지거나 다운될 수 있습니다.
    * 쿠버네티스의 `HPA (Horizontal Pod Autoscaler)`를 사용하여 GPU나 CPU 사용량이 일정 수준 이상으로 올라가면, FastAPI 서비스의 Pod 개수를 자동으로 늘려 트래픽을 분산 처리하도록 설정합니다. 사용량이 줄면 다시 Pod 개수를 줄여 비용을 최적화합니다.

### 최종 흐름 요약

```
[개발자]         [GitHub]         [GitHub Actions CI]        [Container Registry]        [Kubernetes (ArgoCD)]
코드 Push  --->  Webhook  --->   1. 빌드 & 테스트         --->   Docker 이미지 저장   --->  Git 변경 감지 & 자동 배포
(Git)          (자동 트리거)       2. Docker 이미지 빌드                                        (무중단 업데이트)
                                                                                            (Auto-Scaling)
```

이와 같이 환경을 구성하면, 개발자는 `Git`에 코드를 푸시하는 것만으로 빌드, 테스트, 배포 전 과정이 자동으로 처리되는 효율적인 개발 문화를 만들 수 있습니다. 특히 머신러닝 프로젝트의 복잡한 모델 관리까지 파이프라인에 통합하여 안정적이고 재현 가능한 서비스 운영이 가능해집니다.
