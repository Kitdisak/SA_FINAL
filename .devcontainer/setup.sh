#!/bin/bash
# รันครั้งเดียวหลัง Codespace ถูกสร้าง: เตรียมไฟล์ .env และติดตั้งแพ็กเกจ
set -e
cd "$(dirname "$0")/../server"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "สร้าง server/.env จาก .env.example แล้ว"
fi
# ค่าสำหรับ Oracle ใน Codespace (container oracle ใช้เครือข่ายเดียวกัน จึงเป็น 127.0.0.1 — ไม่ใช้ localhost เพราะ Node จะไปต่อ IPv6 ::1 แล้วต่อไม่ได้)
sed -i 's#^DB_CONNECT_STRING=.*#DB_CONNECT_STRING=127.0.0.1:1521/FREEPDB1#' .env
sed -i 's#^DB_PASSWORD=ChangeThisPassword!$#DB_PASSWORD=orcl#' .env

npm install --no-audit --no-fund
echo ""
echo "ติดตั้งเสร็จแล้ว: รอ Oracle พร้อม (ครั้งแรก 2-5 นาที) แล้วพิมพ์  cd server && npm start"
