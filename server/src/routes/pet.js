import {
  SPECIES, SHOP, getPet, adoptPet, ownedItems,
  settleCoins, petState, buyItem, equipItem, unequipSlot, speciesOf, replacePet,
} from '../pet.js';
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

    const pet = getPet(u);
    if (!pet) return { pet: null, species: SPECIES, mine };

    return {
      mine,
      // 換寵物也要挑，所以不管有沒有養都要把清單帶出去
      species: SPECIES,
      pet: { ...pet, speciesName: speciesOf(pet.species).name, tint: speciesOf(pet.species).tint },
      state: petState(u),
      // 生活習性（來源：pet/動物特性.txt），Godot 的狀態機吃這份
      behavior: behaviorOf(pet.species),
      owned: ownedItems(u),
      shop: SHOP,
      settled,
    };
  });

  app.post('/pet', async (req, reply) => {
    writeGuard(req);
    return reply.code(201).send(adoptPet(req.userId, req.body?.species, req.body?.name));
  });

  // 換寵物：舊的紀錄與代幣會被清掉，前端必須先確認過
  app.post('/pet/replace', async (req) => {
    writeGuard(req);
    return replacePet(req.userId, req.body?.species, req.body?.name);
  });

  app.post('/pet/buy', async (req) => {
    writeGuard(req);
    return buyItem(req.userId, req.body?.item);
  });

  app.post('/pet/equip', async (req) => {
    writeGuard(req);
    return req.body?.slot
      ? unequipSlot(req.userId, req.body.slot)
      : equipItem(req.userId, req.body?.item);
  });
}
