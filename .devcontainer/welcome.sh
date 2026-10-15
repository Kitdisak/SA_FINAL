#!/bin/bash
# แสดงทุกครั้งที่เปิด Codespace: บอกว่า Oracle พร้อมหรือยัง และคำสั่งที่ใช้บ่อย
cd "$(dirname "$0")/../server" 2>/dev/null || exit 0
echo "=============================================================="
echo " ระบบประเมินพนักงาน — Codespace"
echo "   เริ่มเว็บ:      cd server && npm start   (แล้วเปิดพอร์ต 3000 ในแท็บ PORTS)"
echo "   ตรวจฐานข้อมูล:  cd server && npm run db:check"
echo "   ล้างข้อมูลใหม่:  cd server && npm run db:reset"
echo "   บัญชีทดลอง:     hr01 / nida / somchai ...  PIN 1234"
echo "=============================================================="
