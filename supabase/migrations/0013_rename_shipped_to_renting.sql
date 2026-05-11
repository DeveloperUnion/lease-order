-- Rename order status value: shipped → renting
-- 状態名を行為ベース(shipped)から状態ベース(renting)に変更。
-- orders.status は CHECK 制約のない text カラムなので UPDATE のみ。

update orders set status = 'renting' where status = 'shipped';
