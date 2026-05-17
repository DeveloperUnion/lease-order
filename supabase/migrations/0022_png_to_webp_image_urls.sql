-- kn{5,6,9}_img.png をすべて .webp に移行したことに伴い、DB に残る画像URL を更新する。
-- materials テーブルには image_url カラムが存在せず、素材画像は
-- material_images.image_id → images.url 経由で参照されるため、
-- images.url を書き換えれば素材経由の参照も自動的に追従する。
-- public/images/ の物理ファイルは削除済み。本 migration を当てないと 404 になる。

update categories
  set image_url = replace(image_url, '_img.png', '_img.webp')
  where image_url like '%/images/materials/kn%_img.png';

update images
  set url = replace(url, '_img.png', '_img.webp')
  where url like '%/images/materials/kn%_img.png';
