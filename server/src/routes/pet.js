import {
  SPECIES, shopFor, getPet, adoptPet, ownedItems,
  settleCoins, petState, buyItem, equipItem, unequipSlot, speciesOf, replacePet,
  listPets, purchasePet, selectPet, renamePet, PET_PRICE, itemOf,
  roomDecor, arrangeDecor, restoreRoom, rewardOverview,
  petRoomPosition, movePet, rewardWorkoutSaved,
} from '../pet.js';
import {petCare,interactPet} from '../pet-care.js';
import { behaviorOf } from '../pet-behavior.js';
import { getUser } from '../users.js';

export default async function petRoutes(app) {
  /** 看別人的寵物是唯讀的，跟飲食與訓練一樣 */
  function viewUser(req) {
    const asked = req.query?.user;
    if (!asked || asked === req.userId) return req.userId;
    if (!getUser(asked)) {
      throw Object.assign(new Error(`沒有這個使用者：${asked}`), { status: 404 });
    }
    return asked;
  }
  const writeGuard = (req) => {
    if (req.query?.user && req.query.user !== req.userId) {
      throw Object.assign(new Error('只能看對方的寵物，不能動牠'), { status: 403 });
    }
  };

  /** 一次把畫面要的東西全給：寵物、狀態、擁有的東西、商城 */
  app.get('/pet', async (req) => {
    const u = viewUser(req);
    const mine = u === req.userId;

    // 只有自己進來才結算代幣，看別人不該觸發對方的結算
    const settled = mine ? settleCoins(u) : { earned: 0, days: 0 };

    if(mine)rewardWorkoutSaved(u);
    const pet = getPet(u);
    if (!pet) return { pet: null, species: SPECIES, mine };

    return {
      mine,
      // 換寵物也要挑，所以不管有沒有養都要把清單帶出去
      species: SPECIES,
      pet: { ...pet, speciesName: speciesOf(pet.species).name, tint: speciesOf(pet.species).tint },
      state: petState(u),
      care: petCare(u,pet.petKey),
      // 生活習性（來源：pet/動物特性.txt），前端的行為狀態機吃這份
      behavior: behaviorOf(pet.species),
      roster: listPets(u).map(p => ({
        petKey: p.petKey, species: p.species, name: p.name, equipped: p.equipped,
        speciesName: speciesOf(p.species).name, behavior: behaviorOf(p.species),
        position:petRoomPosition(u,p.petKey),
        worn: ['outfit'].map(slot => itemOf(p.equipped[slot])).filter(item => item && item.species === p.species),
      })),
      petsForSale: SPECIES.map(s => ({ species: s.id, name: s.name, nick: s.nick, price: PET_PRICE, img: `/pets/${s.id}-pet.webp` })),
      owned: ownedItems(u),
      decorations: roomDecor(u),
      shop: shopFor(pet.species),
      settled,
      rewards: mine ? rewardOverview(u) : null,
    };
  });

  app.post('/pet', async (req, reply) => {
    writeGuard(req);
    return reply.code(201).send(adoptPet(req.userId, req.body?.species, req.body?.name));
  });

  // 換寵物：舊的紀錄與代幣會被清掉，前端必須先確認過
  app.post('/pet/replace', async (req) => {
    writeGuard(req);
    // 這是唯一不可復原的操作，而且開發期間誤觸過好幾次、事後都查不出來源
    //（伺服器一重啟日誌就被蓋掉）。用 warn 留一筆，連來源一起記。
    req.log.warn({
      user: req.userId,
      to: req.body?.species,
      confirm: req.body?.confirm,
      ua: req.headers['user-agent'],
      ip: req.ip,
    }, '換寵物');
    return replacePet(req.userId, req.body?.species, req.body?.name, req.body?.confirm);
  });

  app.post('/pet/buy', async (req) => {
    writeGuard(req);
    return buyItem(req.userId, req.body?.item, req.body?.petKey);
  });

  app.post('/pet/purchase', async (req, reply) => {
    writeGuard(req);
    return reply.code(201).send(purchasePet(req.userId, req.body?.species, req.body?.name, req.body?.requestId));
  });
  app.post('/pet/interact', async req => {writeGuard(req);return interactPet(req.userId,req.body?.petKey);});
  app.post('/pet/select', async (req) => {
    writeGuard(req);
    return selectPet(req.userId, req.body?.petKey);
  });
  app.patch('/pet/name', async (req) => {
    writeGuard(req);
    return renamePet(req.userId, req.body?.petKey, req.body?.name);
  });

  app.post('/pet/equip', async (req) => {
    writeGuard(req);
    return req.body?.slot
      ? unequipSlot(req.userId, req.body.slot, req.body?.petKey)
      : equipItem(req.userId, req.body?.item, req.body?.petKey);
  });
  app.patch('/pet/room', async (req) => {
    writeGuard(req);
    return arrangeDecor(req.userId, req.body?.item, req.body?.position, req.body?.expected);
  });
  app.put('/pet/room', async(req)=>{
    writeGuard(req);
    return restoreRoom(req.userId,req.body?.items,req.body?.expected);
  });
  app.patch('/pet/position',async(req)=>{
    writeGuard(req);
    return movePet(req.userId,req.body?.petKey,req.body?.position);
  });
}
