package study.shop.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import study.shop.common.RequestTimingInterceptor;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final RequestTimingInterceptor timingInterceptor;

    public WebConfig(RequestTimingInterceptor timingInterceptor) {
        this.timingInterceptor = timingInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(timingInterceptor).addPathPatterns("/api/**");
    }
}
