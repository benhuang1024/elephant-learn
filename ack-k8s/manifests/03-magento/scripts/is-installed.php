<?php
// 退出码：0 已安装，1 未安装，2 连不上数据库
try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;dbname=%s', getenv('DB_HOST'), getenv('DB_NAME')),
        getenv('DB_USER'),
        getenv('DB_PASSWORD')
    );
} catch (PDOException $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(2);
}
exit($pdo->query("SHOW TABLES LIKE 'core_config_data'")->rowCount() > 0 ? 0 : 1);
