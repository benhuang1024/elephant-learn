package study.shop.common;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** 只对 /api/** 生效，能拿到 HandlerMethod（知道调用的是哪个 Controller 方法）。 */
@Component
public class RequestTimingInterceptor implements HandlerInterceptor {

    private static final String START_ATTRIBUTE = RequestTimingInterceptor.class.getName() + ".start";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START_ATTRIBUTE, System.nanoTime());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler,
            Exception ex) {
        if (request.getAttribute(START_ATTRIBUTE) instanceof Long start) {
            long elapsedMillis = (System.nanoTime() - start) / 1_000_000;
            response.setHeader("X-Elapsed-Ms", Long.toString(elapsedMillis));
        }
    }
}
