export const COIN_RULES={meal:5,mealLimit:3,kcal:20,protein:20,strength:20,cardio:15,dailyMax:90};
export const coinRulesFor=date=>date>='2026-10-15' ? COIN_RULES : {meal:2,mealLimit:3,kcal:8,protein:8,strength:8,cardio:6,dailyMax:36};
