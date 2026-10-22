package study.shop.common;

public class NotFoundException extends RuntimeException {

    public NotFoundException(String resource, Object id) {
        super("%s 不存在: %s".formatted(resource, id));
    }

    public NotFoundException(String message) {
        super(message);
    }
}
