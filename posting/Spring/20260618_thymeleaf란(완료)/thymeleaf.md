# View 환경설정: Thymeleaf 알아보기

백엔드 API 서버는 어느 정도 준비가 되었으니, 이제 사용자가 마주할 화면, 즉 뷰(View)를 설정할 차례다. Spring Boot와 함께 사용할 뷰 기술로는 여러 가지가 있지만, 이번에 학습하고 정리해 볼 기술은 **타임리프(Thymeleaf)**이다.

## Thymeleaf란?

Thymeleaf는 **서버 사이드 자바 템플릿 엔진**이다. 서버에서 동적인 데이터를 HTML에 결합하여 완성된 웹 페이지를 만들어주는 역할을 한다.

가장 인상 깊었던 장점은 **내추럴 템플릿(Natural Template)**이라는 것인데, 이게 뭐냐면 Thymeleaf 문법(`th:*`)이 포함된 HTML 파일이라도 그 자체로 HTML 문법을 완벽하게 지킨다는 점이다. 덕분에 웹 디자이너가 백엔드 서버 없이도 이 파일을 그냥 웹 브라우저로 열어서 디자인을 확인하고 수정할 수 있다. 협업할 때 정말 편리한 기능인 것 같다.

### 특징 요약

* **내추럴 템플릿 (Natural Template)**: 타임리프 문법이 있어도 순수 HTML 구조를 해치지 않아, 웹 브라우저에서 바로 열어볼 수 있다.
* **스프링 표현식(Spring EL) 완벽 지원**: `${...}`, `*{...}` 등 스프링의 표현식을 그대로 사용하여 모델 데이터를 쉽게 바인딩하고, 조건부 렌더링을 수행할 수 있다.
* **Spring과의 깊은 통합**: Spring MVC와 자연스럽게 연동되어, 별도의 복잡한 설정 없이도 모델 데이터, 폼 바인딩, 검증 오류 처리 등을 지원한다.
* **레이아웃 재사용**: `템플릿 조각(Fragment)` 기능을 통해 공통 헤더나 푸터 등을 분리하고 재사용할 수 있어, 중복 코드를 크게 줄일 수 있다.

## 문법 살펴보기

기본적으로 HTML 태그에 `th:*` 형태의 속성을 추가하여 동적인 기능을 구현한다.

* **변수 출력**: `${...}`를 사용해 컨트롤러에서 넘겨준 모델의 속성 값을 출력한다.

    ```html
    <p th:text="${user.name}">홍길동</p>
    ```

* **조건부 처리**: `th:if` 또는 `th:unless` 속성으로 특정 조건에만 태그가 보이도록 할 수 있다.

    ```html
    <div th:if="${user != null}">
        환영합니다, <span th:text="${user.name}">유저</span>님!
    </div>
    ```

* **반복 처리**: `th:each`는 Java의 for-each문처럼 리스트나 컬렉션 데이터를 반복해서 출력할 때 사용한다.

    ```html
    <ul>
        <li th:each="item : ${items}" th:text="${item}">항목 1</li>
    </ul>
    ```

* **링크 처리**: `@{...}` 문법으로 URL을 동적으로 생성한다. 특히 경로 변수(PathVariable)를 사용할 때 유용하다.

    ```html
    <a th:href="@{|/posts/${post.id}|}">상세보기</a>
    ```

* **폼(Form) 처리**: `th:object`로 폼이 사용할 객체를 지정하고, `th:field="*{...}"`로 객체의 필드와 입력 요소를 연결(바인딩)한다.

    ```html
    <form th:action="@{/posts}" th:object="${post}" method="post">
      <label>제목: <input type="text" th:field="*{title}" /></label>
      <label>내용: <textarea th:field="*{content}"></textarea></label>
      <button type="submit">저장</button>
    </form>
    ```

* **템플릿 조각(Fragment)**: `th:insert`나 `th:replace`를 사용해 공통 레이아웃을 분리하고 재사용할 수 있다.

    ```html
    <div th:replace="fragments/header :: header">헤더 영역(프로토타입)</div>
    ```

## 실전 예제로 살펴보기: 게시판 화면

게시판의 핵심 기능인 CRUD 화면을 만든다고 가정하고 각 페이지를 타임리프로 어떻게 구성할 수 있는지 살펴보자.

* **글 목록 페이지 (List)**: 컨트롤러에서 `posts`라는 이름으로 게시글 리스트를 넘겨준다고 가정. `th:each`로 반복문을 돌려 테이블을 생성한다.

    ```html
    <!DOCTYPE html>
    <html xmlns:th="http://www.thymeleaf.org">
    <body>
      <h1>게시글 목록</h1>
      <a th:href="@{/posts/new}">글쓰기</a>
      <table>
        <tr><th>제목</th><th>작성자</th><th>상세</th></tr>
        <tr th:each="post : ${posts}">
          <td th:text="${post.title}">제목</td>
          <td th:text="${post.author}">작성자</td>
          <td><a th:href="@{|/posts/${post.id}|}">보기</a></td>
        </tr>
      </table>
    </body>
    </html>
    ```

* **글쓰기 폼 (Create)**: `th:object`로 비어있는 `post` 객체를 받아오고, 각 입력 필드를 `th:field`로 바인딩한다.

    ```html
    <!DOCTYPE html>
    <html xmlns:th="http://www.thymeleaf.org">
    <body>
      <h1>새 게시글 작성</h1>
      <form th:action="@{/posts}" th:object="${post}" method="post">
        <p><label>제목: <input type="text" th:field="*{title}"/></label></p>
        <p><label>내용: <textarea th:field="*{content}"></textarea></label></p>
        <button type="submit">등록</button>
      </form>
    </body>
    </html>
    ```

* **상세 페이지 (Detail)**: 컨트롤러에서 넘겨준 특정 `post` 객체의 정보를 `th:text`로 출력한다.

    ```html
    <!DOCTYPE html>
    <html xmlns:th="http://www.thymeleaf.org">
    <body>
      <h1 th:text="${post.title}">게시글 제목</h1>
      <p th:text="${post.content}">게시글 내용</p>
      <a th:href="@{/posts}">목록으로 돌아가기</a>
    </body>
    </html>
    ```

## Spring Boot와의 통합

Spring Boot와 Thymeleaf의 궁합은 정말 좋다. 복잡한 설정 없이도 거의 모든 것이 자동으로 처리된다.

`build.gradle`에 `spring-boot-starter-thymeleaf` 의존성 하나만 추가하면, Spring Boot가 알아서 Thymeleaf를 인식하고, 기본적으로 `src/main/resources/templates/` 폴더에 있는 `.html` 파일을 템플릿으로 사용하도록 설정해준다.

컨트롤러에서 `Model`에 데이터를 담아 뷰의 이름(예: `"posts"`)을 반환하면, Spring Boot는 `templates/posts.html` 파일을 찾아 렌더링하고 완성된 HTML을 브라우저에 보내준다. 정말 간편하다.

## JSP와의 차이점

과거에 많이 사용되던 JSP와는 어떤 차이점이 있고, 왜 오늘날 Spring Boot 환경에서 타임리프가 권장되는지 그 이유를 정리해봤다.

-   **문법과 가독성**: JSP는 `<c:forEach>`처럼 낯선 태그를 외워야 하지만, 타임리프는 `th:each`처럼 **익숙한 HTML 태그에 속성만 추가**하는 방식이라 훨씬 직관적이다. 순수 HTML 구조를 거의 그대로 유지하기 때문에 디자이너가 보기에도 부담이 적다.

-   **개발 생산성**: 가장 체감되는 차이점이다. 타임리프는 **서버를 실행하지 않고도 파일 자체를 브라우저에서 열어** 기본적인 UI를 확인할 수 있다. 반면 JSP는 반드시 웹 서버(WAS)를 통해 실행해야만 결과물을 볼 수 있어, 간단한 디자인 수정에도 매번 재시작 과정이 필요하다. 타임리프가 개발 피드백 사이클을 훨씬 단축시켜 주는 셈이다.

-   **Spring 통합 및 표현식**: 타임리프는 Spring EL(표현 언어)과 아주 자연스럽게 통합된다. JSP가 JSTL이나 Spring 태그 라이브러리를 별도로 추가해야 하는 반면, 타임리프는 스프링의 기능을 `${...}`, `@{...}` 같은 기본 문법으로 쉽게 활용할 수 있어 설정이 간편하다.

-   **레이아웃 재사용**: 타임리프의 '템플릿 조각(Fragment)' 개념은 JSP의 `include`보다 훨씬 유연하여, 페이지의 특정 부분만 골라 재사용할 수 있어 복잡한 레이아웃 구성에 더 유리하다.

이러한 이유들 때문에, JSP보다 더 현대적이고 유연한 문법을 제공하며 개발 생산성과 유지보수성 면에서 이점이 많은 타임리프가 오늘날 Spring Boot 기반 애플리케이션에서 선호되고 있는 것 같다.