-- ============================================================================
-- 04_hotel_departments.sql : เปลี่ยนแผนกและตำแหน่งของข้อมูลทดลองให้เป็นแบบโรงแรม
-- ใช้เมื่อไม่อยากล้างข้อมูล (npm run db:reset จะได้แผนกแบบโรงแรมอยู่แล้ว ไม่ต้องรันไฟล์นี้)
-- วิธีรัน: SQL Developer -> Connection EVAL_APP -> เปิดไฟล์นี้ -> กด F5 (รันซ้ำได้)
-- ============================================================================
UPDATE departments SET department_name = 'ฝ่ายบริหาร'        WHERE department_name = 'บริหาร';
UPDATE departments SET department_name = 'ขายและการตลาด'     WHERE department_name = 'ฝ่ายขาย';
UPDATE departments SET department_name = 'บัญชีและการเงิน'     WHERE department_name = 'บัญชี';
UPDATE departments SET department_name = 'วิศวกรรม'          WHERE department_name = 'ซ่อมบำรุง';
UPDATE departments SET department_name = 'ทรัพยากรบุคคล'      WHERE department_name = 'ฝ่ายบุคคล';
UPDATE departments SET department_name = 'แม่บ้าน'           WHERE department_name = 'คลังสินค้า';
UPDATE departments SET department_name = 'อาหารและเครื่องดื่ม'  WHERE department_name = 'การตลาด';
UPDATE departments SET department_name = 'ครัว'              WHERE department_name = 'ไอที';
UPDATE departments SET department_name = 'ส่วนหน้า'           WHERE department_name = 'บริการลูกค้า';
UPDATE departments SET department_name = 'รักษาความปลอดภัย'    WHERE department_name = 'ขนส่ง';

UPDATE users SET position_name = 'ผู้จัดการฝ่ายทรัพยากรบุคคล'               WHERE username = 'hr01';
UPDATE users SET position_name = 'เจ้าหน้าที่ฝ่ายขาย (Sales Executive)'      WHERE username = 'somchai';
UPDATE users SET position_name = 'เจ้าหน้าที่การตลาดออนไลน์'                WHERE username = 'suda';
UPDATE users SET position_name = 'ช่างซ่อมบำรุง'                          WHERE username = 'anan';
UPDATE users SET position_name = 'ช่างไฟฟ้า'                             WHERE username = 'chaiwat';
UPDATE users SET position_name = 'เจ้าหน้าที่ทรัพยากรบุคคล'                 WHERE username = 'kanya';
UPDATE users SET position_name = 'พนักงานทำความสะอาดห้องพัก'               WHERE username = 'prasit';
UPDATE users SET position_name = 'พนักงานเสิร์ฟอาหารและเครื่องดื่ม'           WHERE username = 'wanpen';
UPDATE users SET position_name = 'ผู้ช่วยเชฟ'                             WHERE username = 'thanawat';
UPDATE users SET position_name = 'พนักงานต้อนรับส่วนหน้า'                   WHERE username = 'pimchanok';
UPDATE users SET position_name = 'พนักงานรักษาความปลอดภัย'                 WHERE username = 'kittisak';
UPDATE users SET position_name = 'ผู้จัดการฝ่ายขายและการตลาด (พี่เลี้ยง)'     WHERE username = 'mentor01';
UPDATE users SET position_name = 'หัวหน้าฝ่ายวิศวกรรม (พี่เลี้ยง)'            WHERE username = 'mentor02';
UPDATE users SET position_name = 'ผู้จัดการทั่วไป (General Manager)'        WHERE username = 'exec01';
COMMIT;

SELECT u.username, u.position_name, d.department_name FROM users u LEFT JOIN departments d ON d.department_id = u.department_id ORDER BY u.emp_code;
