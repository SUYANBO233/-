import type { SqlClient } from './migrate';
import { D1_FIXTURES } from '../../data/d1-fixtures';
import { CONSTRUCTION_METHODS } from '../../data/decision';

export async function seedD1Fixtures(client: SqlClient): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query("INSERT INTO project(code,name) VALUES('d1_test','临时测试工程') ON CONFLICT(code) DO NOTHING");
    await client.query("INSERT INTO tunnel(project_id,code,name,kind,start_chainage_m,end_chainage_m,length_m) SELECT id,'d1_test_main','临时测试洞线','main',3599000,3603000,4000 FROM project WHERE code='d1_test' ON CONFLICT(code) DO NOTHING");
    for (const [code,name] of [['test_face_a','临时测试主洞工作面'],['test_face_b','临时测试平导工作面']]) {
      await client.query('INSERT INTO workface(tunnel_id,code,name) SELECT id,$1,$2 FROM tunnel WHERE code=$3 ON CONFLICT(code) DO NOTHING',[code,name,'d1_test_main']);
    }
    for (const method of CONSTRUCTION_METHODS) {
      await client.query(`INSERT INTO construction_method(code,name,geology,section,advantage,equipment_text,rock_grades,cycle_hours,advance_m,shotcrete_thickness_mm,monthly_advance_m,description,source)
        VALUES($1,$2,$3,'测试断面','测试资料',$4,'[]',1,1,1,1,$5,'simulation') ON CONFLICT(code) DO NOTHING`,[method.key,method.name,method.rock,method.equip,method.desc]);
    }
    await client.query('SELECT publish_decision_catalog($1::jsonb)',[JSON.stringify(D1_FIXTURES)]);
    await client.query('COMMIT');
  } catch (error: unknown) { await client.query('ROLLBACK'); throw error; }
}
