# Spring 서버 AWS 인프라 트러블슈팅: Secrets Manager 연동 및 보안 그룹 최적화

## 🚨 문제 상황 요약

**발생 시간**: 2025년 7월 2일 새벽 3시 ~ 오전 9시 (총 6시간)  
**주요 증상**: Spring Boot 애플리케이션 시작 실패, EC2 인스턴스 무한 재시작  
**근본 원인**: AWS Secrets Manager 접근 권한 부족 및 보안 그룹 설정 혼재

![image.png](image.png)

*새벽 3시부터 9시까지의 사투 기록... 정신없이 조치하느라 모든 과정을 기록하지는 못했지만, 기억나는 대로 정리해보았다.*

## 📋 발단: 개발 환경 구성 중 발생한 이슈

### 초기 상황
- **목적**: 프론트엔드 개발을 위해 각 팀원이 로컬에서 서버 DB에 접근할 수 있도록 환경 구성
- **방법**: SSM 포트포워딩을 통해 AWS RDS를 온프레미스 MySQL처럼 사용
- **문제 발생**: 새벽 2~3시경 현아로부터 "Spring 부팅 속도가 느려지고 가끔 끊긴다"는 이슈 접수

### 초기 진단의 오류
- **잘못된 가정**: EC2 문제가 아닌 `properties` 파일 설정 문제로 판단
- **실제 원인**: EC2 인스턴스 자체가 정상적으로 작동하지 않고 있었음
- **증상**: 특정 구간(`HikariPool-1 - Starting...`)에서 지연 또는 오류 발생

## 🔍 문제 발견 과정

### AWS 인프라 상태 확인
![image 1.png](image%201.png)

AWS 대상 그룹(Target Group)을 확인한 결과:
- **3시부터**: 비정상 호스트 1개 발생
- **4시 30분부터**: 비정상 호스트 2개로 증가 (완전히 서비스 불가)
- **증상**: EC2 인스턴스가 죽고 재실행하고 죽고 재실행하는 무한 반복

### 근본 원인 파악
EC2 내부 CLI 환경에서 로그 분석 결과:
1. **Spring 애플리케이션 시작 실패** → 바로 종료
2. **헬스체크 응답 불가** → AWS가 인스턴스를 `Unhealthy`로 판단
3. **Auto Scaling 동작** → 인스턴스 종료 후 재시작
4. **무한 반복** → 새 인스턴스도 동일한 문제로 시작 실패

## 🚨 발생한 주요 이슈들

### 1. Spring Boot 애플리케이션 시작 실패

**핵심 오류 메시지:**
```
Could not resolve placeholder 'payment.toss.secretKey' in value "${payment.toss.secretKey}"
```

**근본 원인:**
- EC2 인스턴스의 IAM 역할에 AWS Secrets Manager 접근 권한 부족
- PaymentService 빈 생성 실패로 인한 전체 애플리케이션 시작 불가

**증상:**
- 헬스체크 실패로 Load Balancer에서 인스턴스 제외
- 애플리케이션 컨텍스트 초기화 실패
- 모든 의존성 주입 실패

### 2. 데이터베이스 연결 설정 혼재

**문제점:**
- RDS `tio-db2` 새로 생성했지만 연결 설정 불명확
- 여러 보안 그룹이 중복 설정되어 복잡함
- 데이터베이스명 누락 (`tryiton_db` 미생성)

**증상:**
- DB 연결 불안정
- 설정 관리 복잡성 증가
- 개발팀 간 혼선

### 3. 불필요한 보안 그룹 난립

**문제가 된 보안 그룹들:**
- `rds-ec2-1` (sg-00344dbd714648d74)
- `rds-ec2-2` (sg-0a88502806bda184b)  
- `ec2-rds-2` (sg-039ec0c0b39d91edd)

**원인:**
- 테스트 과정에서 생성된 중복 보안 그룹들
- RDS 재생성 간 초기설정 오류로 그룹 혼재

**증상:**
- 설정 복잡성 증가
- 관리 어려움
- 보안 정책 혼재

## ✅ 단계별 해결 과정

### 1단계: IAM 권한 문제 해결

```bash
# EC2 IAM 역할에 Secrets Manager 접근 권한 추가
aws iam attach-role-policy \
  --role-name TIO-EC2-Role \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

**결과:**
- AWS Secrets Manager 연동 성공
- 모든 시크릿 정상 로드 확인
- PaymentService 빈 생성 성공

### 2단계: 보안 그룹 정리 및 최적화

**삭제된 보안 그룹들:**
- `sg-00344dbd714648d74` (rds-ec2-1)
- `sg-0a88502806bda184b` (rds-ec2-2)
- `sg-039ec0c0b39d91edd` (ec2-rds-2)

**최종 구성:**
- Spring EC2 SG → TIO-DB-SG로 단순화
- 명확한 인바운드/아웃바운드 규칙 정의

**결과:**
- 보안 정책 명확화
- 관리 복잡성 대폭 감소
- 네트워크 연결 안정화

![image 2.png](image%202.png)

### 3단계: 인스턴스 갱신

```bash
# Auto Scaling Group Instance Refresh 실행
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name TIO-Spring-ASG
```

**결과:**
- 새로운 IAM 권한이 적용된 인스턴스로 교체
- 헬스체크 통과
- 정상 서비스 제공 시작

## 🎯 최종 해결 상태

### ✅ AWS Secrets Manager 연동 성공

**관리되는 시크릿들:**
- `tio/payments/toss` - Toss 결제 API 키
- `tio/mail` - Gmail SMTP 설정  
- `tio/jwt` - JWT 토큰 시크릿
- `tio/oauth/google` - Google OAuth 클라이언트 정보
- `tio/db/credentials` - 데이터베이스 인증정보

### ✅ RDS 연결 성공

**데이터베이스 정보:**
- **호스트**: `tio-db2.cjgee4eswvls.ap-northeast-2.rds.amazonaws.com`
- **데이터베이스**: `tryiton_db`
- **연결 풀**: HikariCP 정상 동작
- **상태**: MySQL 8.0.41, 정상 운영 중

### ✅ Spring Boot 애플리케이션 정상 시작

**애플리케이션 상태:**
- **서버**: 포트 8080에서 Tomcat 서버 실행
- **JPA**: 16개 리포지토리 스캔 완료
- **웹**: DispatcherServlet 초기화 완료
- **상태**: 모든 빈 정상 생성, 헬스체크 통과

## 📊 현재 아키텍처

```
Internet → ALB → Target Group → Spring EC2 Instances (t3.medium)
                                        ↓
                               AWS Secrets Manager
                                        ↓
                            RDS tio-db2 (MySQL 8.0.41)
```

### 보안 그룹 구성 (최적화 완료)

- **Spring EC2**: `sg-03013d9ddc99a1878` (TIO-Spring-EC2-SG)
- **RDS**: `sg-08e7fca9957f28445` (TIO-DB-SG)  
- **ALB**: `sg-082ed9869e5c620f1` (TIO-ALB-SG)

## 🚀 성능 및 안정성 개선사항

### 인프라 최적화
- **인스턴스 타입**: t2.micro → t3.medium (4GB RAM)
- **Auto Scaling**: 최소 2개, 최대 4개 인스턴스
- **헬스체크**: ELB 기반, 500초 Grace Period

### 보안 강화
- **IAM 역할**: 최소 권한 원칙 적용
- **Secrets Manager**: 민감 정보 중앙화 관리
- **보안 그룹**: 필요한 포트만 허용

### 모니터링 개선
- **CloudWatch**: 로그 수집 활성화
- **헬스체크**: ALB Target Group 모니터링  
- **메트릭**: CPU, 메모리, 네트워크 추적

## 🔄 추가 이슈: develop 브랜치 병합 후 CI 트러블

![image 3.png](image%203.png)

![image 4.png](image%204.png)

**발생 상황:**
- develop 브랜치 병합 후 CI/CD 파이프라인에서 빌드 실패
- 의존성 충돌 및 테스트 환경 설정 문제

**해결 방안:**
- 의존성 버전 통일
- 테스트 환경 설정 재정비
- CI/CD 파이프라인 스크립트 수정

## 📝 교훈 및 개선점

### 배운 점
1. **초기 진단의 중요성**: 증상만 보고 판단하지 말고 전체적인 시스템 상태 확인 필요
2. **IAM 권한 관리**: 새로운 AWS 서비스 도입 시 권한 설정 사전 확인 필수
3. **보안 그룹 관리**: 테스트용 리소스는 즉시 정리하여 혼선 방지

### 개선 사항
1. **모니터링 강화**: CloudWatch 알람 설정으로 조기 감지 체계 구축
2. **문서화**: 인프라 변경 사항에 대한 체계적인 문서화
3. **테스트 환경**: 프로덕션과 동일한 환경에서의 사전 테스트 필수

### 향후 계획
1. **자동화**: Infrastructure as Code (Terraform) 도입 검토
2. **백업**: 데이터베이스 자동 백업 및 복구 절차 수립
3. **보안**: 정기적인 보안 그룹 및 IAM 정책 감사

---

*이번 트러블슈팅을 통해 AWS 인프라의 복잡성과 체계적인 접근의 중요성을 다시 한번 깨달았다. 6시간의 고생이 헛되지 않도록 이 경험을 바탕으로 더 안정적인 시스템을 구축해 나가야겠다.*
