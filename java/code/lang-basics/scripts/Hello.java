// 像 `php hello.php` 一样直接运行单文件（Java 25 紧凑源文件 + 实例 main 方法）：
//   java scripts/Hello.java Ben
// 不需要 class 声明、不需要 public static void main(String[] args)、不需要先 javac。
// 适合写脚本/草稿；正式工程仍然用 Maven + 标准类结构。

void main(String[] args) {
    var name = args.length > 0 ? args[0] : "PHPer";
    IO.println("Hello, " + name + "! 当前 Java 版本：" + Runtime.version());

    // PHP: $prices = ['apple' => 3, 'pear' => 5];
    var prices = Map.of("apple", 3, "pear", 5);
    // PHP: array_sum($prices)
    int total = prices.values().stream().mapToInt(Integer::intValue).sum();
    IO.println("total = " + total);
}
