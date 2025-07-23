# nGrinder 설치 및 실행 가이드: 트러블슈팅 포함

## 🔍 성능 테스트의 중요성

웹 서비스를 개발하고 운영하면서 가장 중요한 요소 중 하나는 성능입니다. 사용자가 증가하거나 트래픽이 급증할 때 시스템이 어떻게 동작하는지 미리 파악하는 것은 서비스의 안정성과 사용자 경험에 직결됩니다. 성능 테스트는 다음과 같은 이유로 필수적입니다:

- **병목 현상 발견**: 시스템의 어느 부분이 성능 저하를 일으키는지 식별
- **확장성 검증**: 사용자 증가에 따른 시스템의 대응 능력 확인
- **장애 예방**: 실제 트래픽 급증 상황 전에 문제점 발견 및 해결
- **인프라 최적화**: 적절한 서버 규모와 리소스 할당 결정

성능 테스트를 위해서는 실제 사용자 환경을 시뮬레이션할 수 있는 전문 도구가 필요합니다. 이러한 도구들은 수백, 수천 명의 가상 사용자를 생성하여 동시에 시스템에 부하를 가할 수 있습니다. 대표적인 성능 테스트 도구로는 Apache JMeter, Gatling, Locust 등이 있으며, 오늘 소개할 nGrinder도 이 중 하나입니다.

## 📌 nGrinder란?

nGrinder는 네이버에서 개발한 오픈소스 부하 테스트 도구입니다. 웹 애플리케이션의 성능을 측정하고 병목 현상을 찾아내는 데 유용하게 사용됩니다. 다음과 같은 특징을 가지고 있습니다:

- **분산 부하 테스트**: 여러 에이전트를 통한 대규모 부하 생성 가능
- **직관적인 웹 인터페이스**: 테스트 생성, 실행, 모니터링을 위한 사용하기 쉬운 UI 제공
- **스크립트 기반**: Groovy 또는 Python 스크립트를 사용한 유연한 테스트 시나리오 작성
- **실시간 모니터링**: 테스트 진행 상황과 결과를 실시간으로 확인
- **상세한 리포트**: 테스트 결과에 대한 다양한 통계 및 그래프 제공

nGrinder는 특히 한국 개발 환경에서 많이 사용되며, 한글 문서와 커뮤니티 지원이 활발한 편입니다.

> 📚 **참고 자료**
> - [nGrinder 공식 문서](https://naver.github.io/ngrinder/)
> - [GitHub 사용자 가이드](https://github.com/naver/ngrinder/wiki/User-Guide)

## 🚀 설치 및 실행 과정

### 1️⃣ 다운로드

최신 버전의 nGrinder는 GitHub 릴리스 페이지에서 다운로드할 수 있습니다:
[https://github.com/naver/ngrinder/releases](https://github.com/naver/ngrinder/releases)

필요한 파일:
- ngrinder-controller-[버전].war (예: ngrinder-controller-3.5.9-p1.war)
- ngrinder-agent-[버전]-localhost.tar (예: ngrinder-agent-3.5.9-p1-localhost.tar)
- ngrinder-monitor-[버전].tar (예: ngrinder-monitor-3.5.9-p1.tar)

### 2️⃣ 설치 과정과 트러블슈팅

#### 초기 실행 시도 및 문제 해결

**첫 번째 실행 시도:**
```bash
java -jar ngrinder-controller-3.5.9-p1.war
```

**발생한 에러:**
```
ERROR
Please set java.io.tmpdir property like following. tmpdir should be different from the OS default tmpdir.
java -Djava.io.tmpdir=${NGRINDER_HOME}/lib -jar ngrinder-controller.war
```

**해결 방법:**
```bash
# ngrinder 홈 디렉토리 생성
mkdir -p ~/ngrinder_home/lib

# 올바른 옵션으로 실행
cd ~/Desktop
java -Djava.io.tmpdir=~/ngrinder_home/lib -jar ngrinder-controller-3.5.9-p1.war
```

#### SVN 권한 문제 해결

**발생한 에러:**
```
ERROR FileEntryRepository.java:192 : Error while fetching files from SVN for admin
SVNException: svn: E160004: Can't read length line from file /Users/ahpicl/.ngrinder/repos/admin/db/fs-type: Permission denied
```

**권한 문제 해결 과정:**
```bash
# 1. 권한 수정 시도 (부분적 해결)
chmod -R 755 ~/.ngrinder

# 2. 근본적 해결: 기존 저장소 백업 후 완전 삭제
cd ~/.ngrinder && mv repos repos_backup_$(date +%Y%m%d_%H%M%S)
sudo rm -rf ~/.ngrinder
```

#### Agent 및 Monitor 설치

```bash
# 압축 파일 해제
cd ~/Desktop
tar -xf ngrinder-agent-3.5.9-p1-localhost.tar
tar -xf ngrinder-monitor-3.5.9-p1.tar
```

### 3️⃣ 최종 실행 가이드

#### 1단계: Controller 실행

```bash
cd ~/Desktop
java -Djava.io.tmpdir=~/ngrinder_home/lib -jar ngrinder-controller-3.5.9-p1.war
```

![nGrinder Controller 실행 화면](image.png)

✅ **성공 확인**: 로그 메시지 끝에 `Tomcat started on port(s) : 8080 (http) with context path ~` 문구가 표시되면 컨트롤러가 정상적으로 실행된 것입니다.

![nGrinder 실행 성공 로그](image%201.png)

#### 2단계: Agent 실행 (새 터미널에서)

```bash
cd ~/Desktop/ngrinder-agent
./run_agent.sh
```

![Agent 실행 화면](image%202.png)

#### 3단계: 웹 UI 접속

브라우저에서 [http://localhost:8080](http://localhost:8080/) 접속

![nGrinder 로그인 화면](image%203.png)

**기본 로그인 정보:**
- 아이디: admin
- 비밀번호: admin

#### 4단계: Agent 연결 확인

Admin → Agent Management 메뉴에서 Agent 상태를 확인합니다.
"Ready" 상태로 표시되면 정상적으로 연결된 것입니다.

![Agent 연결 상태 확인](image%204.png)

## 🔧 주요 해결 포인트 및 팁

### 권한 문제 해결
- macOS에서는 SVN 저장소 권한 충돌이 자주 발생합니다
- 기존 `.ngrinder` 디렉토리를 완전히 삭제하고 재생성하는 것이 가장 확실한 해결책입니다

### 실행 옵션 설정
- `java.io.tmpdir` 설정은 필수입니다
- OS 기본 임시 디렉토리와 다른 경로를 지정해야 합니다

### 파일 구조 정리
```
~/Desktop/
├── ngrinder-controller-3.5.9-p1.war
├── ngrinder-agent/
│   ├── run_agent.sh
│   └── lib/
└── ngrinder-monitor/
    └── run_monitor.sh
~/ngrinder_home/lib/  (임시 디렉토리)
~/.ngrinder/          (설정 및 저장소, 자동 생성)
```

## 🎯 성능 테스트 준비

이제 nGrinder 설치가 완료되었으며:
- Controller가 정상적으로 실행되고 웹 UI에 접속 가능합니다
- Agent가 Controller에 성공적으로 연결되었습니다
- SVN 에러가 완전히 해결되었습니다
- 성능 테스트를 위한 준비가 완료되었습니다

다음 단계로 EC2 인스턴스나 다른 서버를 대상으로 성능 테스트 스크립트를 작성하고 실행할 수 있습니다.

## 📝 추가 팁

1. **포트 변경**: 기본 8080 포트가 이미 사용 중인 경우 다음과 같이 변경할 수 있습니다:
   ```bash
   java -Djava.io.tmpdir=~/ngrinder_home/lib -Dserver.port=9090 -jar ngrinder-controller-3.5.9-p1.war
   ```

2. **메모리 설정**: 대규모 테스트를 위해 JVM 메모리를 늘릴 수 있습니다:
   ```bash
   java -Xms1g -Xmx2g -Djava.io.tmpdir=~/ngrinder_home/lib -jar ngrinder-controller-3.5.9-p1.war
   ```

3. **원격 Agent 설정**: 분산 부하 테스트를 위해 다른 서버에 Agent를 설치할 수 있습니다. 이 경우 Controller의 IP 주소를 Agent 설정에 지정해야 합니다.

## 🔄 성능 테스트 시나리오 작성

nGrinder에서는 Groovy와 Python 두 가지 언어로 테스트 스크립트를 작성할 수 있습니다. 각각의 예시를 살펴보겠습니다.

### Groovy 테스트 스크립트 예시

```groovy
import static net.grinder.script.Grinder.grinder
import static org.junit.Assert.*
import net.grinder.script.GTest
import net.grinder.script.Grinder
import net.grinder.scriptengine.groovy.junit.GrinderRunner
import net.grinder.scriptengine.groovy.junit.annotation.BeforeProcess
import net.grinder.scriptengine.groovy.junit.annotation.BeforeThread
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

import org.ngrinder.http.HTTPRequest
import org.ngrinder.http.HTTPRequestControl
import org.ngrinder.http.HTTPResponse

@RunWith(GrinderRunner)
class TestRunner {
    public static HTTPRequest request
    
    @BeforeProcess
    public static void beforeProcess() {
        HTTPRequestControl.setConnectionTimeout(300000)
        request = new HTTPRequest()
    }
    
    @BeforeThread
    public void beforeThread() {
        grinder.statistics.delayReports = true
    }
    
    @Before
    public void before() {
        request.setHeaders(["User-Agent": "nGrinder Test"])
    }
    
    @Test
    public void test() {
        HTTPResponse response = request.GET("https://your-target-url.com/api/endpoint")
        
        if (response.statusCode == 301 || response.statusCode == 302) {
            response = request.GET(response.getHeader("Location"))
        }
        
        assertTrue(response.statusCode == 200)
    }
}
```

### Python 테스트 스크립트 예시

Python으로 nGrinder 테스트 스크립트를 작성할 때는 Jython(Python의 JVM 구현체)을 사용합니다. 다음은 기본적인 Python 테스트 스크립트 예시입니다:

```python
# -*- coding: utf-8 -*-

from net.grinder.script import Test
from net.grinder.script.Grinder import grinder
from net.grinder.plugin.http import HTTPRequest, HTTPPluginControl
from java.util import HashMap

# 테스트 메타데이터 설정
test1 = Test(1, "홈페이지 테스트")
test2 = Test(2, "API 엔드포인트 테스트")

# HTTP 플러그인 설정
control = HTTPPluginControl.getConnectionDefaults()
control.timeout = 60000  # 60초 타임아웃
control.followRedirects = True

# 요청 객체 생성
request = HTTPRequest()

# 테스트 클래스
class TestRunner:
    
    def __init__(self):
        # 헤더 설정
        self.headers = HashMap()
        self.headers.put("User-Agent", "nGrinder Python Test")
        self.headers.put("Accept", "application/json")
    
    # 테스트 1: 홈페이지 접속
    def test_homepage(self):
        test1.record(request)
        result = request.GET("https://your-website.com/", self.headers)
        
        if result.statusCode == 200:
            grinder.logger.info("홈페이지 접속 성공: %d" % result.statusCode)
            return True
        else:
            grinder.logger.error("홈페이지 접속 실패: %d" % result.statusCode)
            return False
    
    # 테스트 2: API 엔드포인트 호출
    def test_api(self):
        test2.record(request)
        
        # POST 요청 데이터 설정
        post_data = "param1=value1&param2=value2"
        
        result = request.POST("https://your-website.com/api/data", 
                             post_data.getBytes("UTF-8"), 
                             self.headers)
        
        if result.statusCode == 200:
            response_body = result.getText()
            grinder.logger.info("API 호출 성공: %s" % response_body[:100])  # 처음 100자만 로깅
            return True
        else:
            grinder.logger.error("API 호출 실패: %d" % result.statusCode)
            return False

# 테스트 실행 함수
def __call__():
    runner = TestRunner()
    
    # 테스트 실행
    homepage_success = runner.test_homepage()
    
    # 홈페이지 접속이 성공한 경우에만 API 테스트 실행
    if homepage_success:
        runner.test_api()
```

### Python 스크립트 작성 시 주의사항

1. **인코딩 설정**: 파일 상단에 `# -*- coding: utf-8 -*-` 주석을 추가하여 UTF-8 인코딩을 명시합니다.

2. **Jython 호환성**: 일반 Python과 달리 Jython은 Java 클래스와 메서드를 직접 사용합니다. 따라서 표준 Python 라이브러리 대신 Java 라이브러리를 활용해야 합니다.

3. **로깅**: `grinder.logger`를 사용하여 테스트 중 정보를 로깅할 수 있습니다.

4. **테스트 레코딩**: `test.record(request)` 메서드를 호출하여 해당 요청을 테스트 통계에 포함시킵니다.

5. **바이트 변환**: 문자열을 바이트로 변환할 때는 Java 방식을 사용합니다. (예: `string.getBytes("UTF-8")`)

## 📊 테스트 결과 분석

nGrinder는 테스트 완료 후 다양한 통계와 그래프를 제공합니다:

- **TPS (Transactions Per Second)**: 초당 처리된 트랜잭션 수
- **평균 응답 시간**: 요청에 대한 평균 응답 시간
- **에러율**: 실패한 요청의 비율
- **CPU/메모리 사용량**: 대상 서버의 리소스 사용 현황
- **사용자 증가에 따른 성능 변화**: 가상 사용자 수 증가에 따른 시스템 반응

이러한 지표를 통해 시스템의 성능 병목 지점을 파악하고 최적화할 수 있습니다.

---

nGrinder를 통해 효과적인 성능 테스트를 진행하시기 바랍니다! 추가 질문이나 문제가 있으면 댓글로 남겨주세요.
