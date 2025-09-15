# ETCD

## ETCD란?

마스터노드의 control plane에 위치해있는 key-value쌍의 저장소이다.

## 기존 DB와의 차이

전통적인 DB는 테이블형식이다. 이러한 DB는 행과 열로 데이터를 저장하고,

만약 아래와 같은 직원 테이블이 있다고 보자


|이름|나이|장소|
|-|-|-|
|홍길동|45|서울|
|김철수|33|서울|
|김영희|21|인천|

각 행은 한 사람을 나타내고, 각 열은 저장되는 정보의 유형을 나타낸다.

만일 연봉, 사원평가에 따른 등급와 같은 정보를 추가하고 싶을 때, 테이블과 그 안에 있는 모든 정보에 아래와 같이 영향을 미치게 된다.

|이름|나이|장소|연봉|등급|
|-|-|-|-|-|
|홍길동|45|서울|5000||
|김철수|33|서울|4000||
|김영희|21|인천||A|

새로운 정보를 추가 할 때 마다 표 전체가 영향을 받아 빈 셀이 많아진다.

ETCD와 같은 key-value 쌍 저장소는 아래와 같이 정보를 문서 또는 페이지 형태로 저장한다. 

|key|value|
|-|-|
|이름|홍길동|
|나이|45|
|장소|서울|
|연봉|5000|


|key|value|
|-|-|
|이름|김철수|
|나이|33|
|장소|서울|
|연봉|4000|


|key|value|
|-|-|
|이름|김영희|
|나이|21|
|장소|인천|
|등급|A|

만일 김철수라는 사원에게 `부서`라는 항목을 추가하고싶다면 해당 사원 정보에 key-value만 추가하면 된다.


|key|value|
|-|-|
|이름|김철수|
|나이|33|
|장소|서울|
|연봉|4000|
|부서|HR|

이 데이터들은 일반적으로 `YAML`이나, `JSON` 형식으로 저장된다.

```json
{
    "이름": "홍길동",
    "나이": "45",
    "장소": "서울",
    "연봉": "5000"
},
{
    "이름": "김철수",
    "나이": "33",
    "장소": "서울",
    "연봉": "4000",
    "부서": "HR"
},
{
    "이름": "김영희",
    "나이": "21",
    "장소": "인천",
    "등급": "A"
}
```

## 쿠버네티스에서 ETCD가 저장하는 데이터

ETCD는 쿠버네티스 클러스터의 모든 상태 정보를 저장하는 중앙 저장소 역할을 한다. 구체적으로 다음과 같은 데이터들이 저장된다.

### 클러스터 구성 정보
- **노드 정보**: 마스터 노드, 워커 노드의 상태와 메타데이터
- **네트워크 설정**: 클러스터 내부 네트워킹 구성
- **인증서**: TLS 인증서와 보안 관련 정보
- **Namespaces**: 클러스터 내 논리적 분할 공간 정보

### 워크로드 관련 데이터
- **Pods**: 실행 중인 모든 Pod의 상태, 스펙, 메타데이터
- **Deployments**: 배포 설정과 레플리카 정보
- **ReplicaSets**: 복제본 관리 정보
- **DaemonSets**: 데몬셋 구성 정보
- **StatefulSets**: 상태가 있는 애플리케이션 정보
- **Bindings**: Pod와 Node 간의 스케줄링 바인딩 정보

### 서비스 및 네트워킹
- **Services**: 서비스 정의와 엔드포인트 정보
- **Endpoints**: 서비스가 트래픽을 전달할 실제 Pod IP 목록
- **Ingress**: 외부 접근 라우팅 규칙
- **NetworkPolicies**: 네트워크 보안 정책

### 설정 및 보안
- **ConfigMaps**: 애플리케이션 설정 데이터
- **Secrets**: 민감한 정보 (패스워드, 토큰 등)
- **ServiceAccounts**: 서비스 계정 정보
- **RBAC**: 역할 기반 접근 제어 설정

### 스토리지
- **PersistentVolumes**: 영구 볼륨 정보
- **PersistentVolumeClaims**: 볼륨 요청 정보
- **StorageClasses**: 스토리지 클래스 정의

### 시스템 및 모니터링
- **Events**: 클러스터 내 발생하는 모든 이벤트 로그 (Pod 생성, 에러 등)

### 실제 저장 예시

etcd에서 Pod 정보는 다음과 같은 형태로 저장된다:

```json
{
  "apiVersion": "v1",
  "kind": "Pod",
  "metadata": {
    "name": "nginx-pod",
    "namespace": "default",
    "uid": "12345-67890-abcdef"
  },
  "spec": {
    "containers": [
      {
        "name": "nginx",
        "image": "nginx:1.20"
      }
    ]
  },
  "status": {
    "phase": "Running",
    "podIP": "10.244.1.5"
  }
}
```

이처럼 etcd는 쿠버네티스의 **모든 상태를 단일 진실 공급원(Single Source of Truth)**으로 관리한다. 만약 etcd가 손상되면 클러스터의 모든 정보가 사라지기 때문에 정기적인 백업이 매우 중요하다.

---

출처:  
https://www.udemy.com/course/certified-kubernetes-administrator-with-practice-tests/learn/lecture/14298420#lecture-article  
https://www.udemy.com/course/certified-kubernetes-administrator-with-practice-tests/learn/lecture/14298422#lecture-article