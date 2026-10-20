import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect,vi} from 'vitest';
it('Martina 專屬贈送可安全重跑，保留錢包、選擇與布置，商城仍十種',async()=>{
 vi.stubEnv('FIT_DATA_DIR',mkdtempSync(join(tmpdir(),'fit-bully-')));
 const p=await import('../server/src/pet.js');
 const {getDb}=await import('../server/src/db.js');
 const {behaviorOf}=await import('../server/src/pet-behavior.js');
 p.adoptPet('martina','dog','原本的狗');const before=p.getPet('martina');
 const gift=p.grantMartinaBully('martina');expect(gift.species).toBe('bully');expect(gift.name).toBe('小霸');
 expect(p.grantMartinaBully('martina').petKey).toBe(gift.petKey);expect(p.listPets('martina')).toHaveLength(2);
 expect(p.getPet('martina')).toEqual(before);expect(p.speciesOf('bully').name).toBe('惡霸犬');expect(p.SPECIES).toHaveLength(10);
 expect(behaviorOf('bully').size).toBe(.36);expect(()=>p.grantMartinaBully('eli')).toThrow('僅限');
 const db=getDb('martina');db.prepare('UPDATE pet_room_positions SET x=60 WHERE pet_key=?').run(gift.petKey);
 p.grantMartinaBully('martina');expect(p.petRoomPosition('martina',gift.petKey).x).toBe(60);
 vi.unstubAllEnvs();
});
