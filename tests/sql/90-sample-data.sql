\set ON_ERROR_STOP 1
insert into students values
('10001','เอ','ทดสอบ',1,1,1,'เอ'),('10002','บี','ทดสอบ',1,1,2,'บี'),('10003','ซี','ทดสอบ',1,1,3,null),
('10004','ดี','ทดสอบ',2,1,1,'ดี'),('10005','อี','ทดสอบ',2,1,2,'อี'),('10006','เอฟ','ทดสอบ',2,1,3,'เอฟ'),('10007','จี','ไม่เคยมา',3,1,1,'จี');
insert into weeks values (4,'game','ภาพจำยังชัดเจน') on conflict do nothing;
-- week 2 puzzle: 10002 & 10003 tie time
insert into checkins (week,student_name,grade,room,number,nickname,solved_at,student_id) values
(2,'เอ ทดสอบ',1,1,1,'เอ','2026-11-01 10:00','10001'),
(2,'บี ทดสอบ',1,1,2,'บี','2026-11-01 10:05','10002'),
(2,'ซี ทดสอบ',1,1,3,null,'2026-11-01 10:05','10003'),
(2,'ดี ทดสอบ',2,1,1,'ดี','2026-11-01 10:09',null),       -- old row, matched by class
(2,'นอก รายชื่อ',5,5,5,'นอก','2026-11-01 10:10',null);    -- old row, unmatched
-- week 3 game manual ranks
insert into checkins (week,student_name,grade,room,number,nickname,student_id) values
(3,'เอ ทดสอบ',1,1,1,'เอ','10001'),(3,'บี ทดสอบ',1,1,2,'บี','10002'),(3,'อี ทดสอบ',2,1,2,'อี','10005'),(3,'เอฟ ทดสอบ',2,1,3,'เอฟ','10006');
select admin_set_ranks2('testpass',3,(select array_agg(id order by id) from checkins where week=3 and student_id in ('10001','10002','10005')), array[5,3,5]);
-- week 4: mathmory run + calcu run with place and negative score
select admin_submit_game('testpass',4,'MM-1','[{"student_id":"10001","nick":"เอ","score":50.5},{"student_id":"10002","nick":"บี","score":80},{"student_id":"10006","nick":"เอฟ","score":80},{"student_id":"99999","nick":"x","score":1}]');
select admin_submit_game('testpass',4,'CA-1','[{"student_id":"10001","nick":"เอ","score":30,"place":1},{"student_id":"10002","nick":"บี","score":55,"place":2},{"student_id":"10006","nick":"เอฟ","score":-12,"place":3},{"student_id":"10005","nick":"อี","score":-12,"place":3}]');
select admin_submit_game('testpass',4,'CA-2','[{"student_id":"10001","score":1,"place":0}]') as bad_place;
select student_id, run_id, score, place from game_results order by run_id, student_id;
select c.student_id, g.rank from game_ranks g join checkins c on c.id=g.checkin_id where g.week=4 order by g.rank;
