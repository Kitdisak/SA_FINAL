#!/bin/bash
# ทำงานอัตโนมัติ "ครั้งแรก" ที่ฐานข้อมูล Oracle ใน Docker ถูกสร้าง (ใช้ทั้ง Codespace และ docker compose)
#   1) สร้างบัญชี EVAL_APP ใน FREEPDB1
#   2) รัน sql/03_document_schema.sql สร้าง 13 ตาราง + ข้อมูลทดลอง
# ถ้าต้องการล้างข้อมูลแล้วเริ่มใหม่ภายหลัง ใช้คำสั่ง  npm run db:reset  ในโฟลเดอร์ server

APP_PW="${EVAL_APP_PASSWORD:-orcl}"
export NLS_LANG=AMERICAN_AMERICA.AL32UTF8

echo ">>> [eval-app] สร้างบัญชี EVAL_APP"
sqlplus -s / as sysdba <<EOF
WHENEVER SQLERROR CONTINUE
ALTER SESSION SET CONTAINER = FREEPDB1;
CREATE USER IF NOT EXISTS EVAL_APP IDENTIFIED BY "${APP_PW}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW, CREATE PROCEDURE TO EVAL_APP;
EXIT
EOF

echo ">>> [eval-app] สร้างตารางและข้อมูลทดลอง (sql/03_document_schema.sql)"
sqlplus -s "EVAL_APP/\"${APP_PW}\"@//localhost:1521/FREEPDB1" < /opt/eval/sql/03_document_schema.sql

echo ">>> [eval-app] ฐานข้อมูลพร้อมใช้งาน"
