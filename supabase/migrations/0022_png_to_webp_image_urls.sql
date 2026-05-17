-- kn{5,6,9}_img.png をすべて .webp に移行したことに伴い、DB に残る画像URL を更新する。
-- 該当ファイル:
--   /images/materials/kn5_img.png -> .webp
--   /images/materials/kn6_img.png -> .webp
--   /images/materials/kn9_img.png -> .webp
-- public/images/ の物理ファイルは削除済み。本 migration を当てないと 404 になる。

update categories
  set image_url = replace(image_url, '_img.png', '_img.webp')
  where image_url like '%/images/materials/kn%_img.png';

update materials
  set image_url = replace(image_url, '_img.png', '_img.webp')
  where image_url like '%/images/materials/kn%_img.png';

update images
  set url = replace(url, '_img.png', '_img.webp')
  where url like '%/images/materials/kn%_img.png';
