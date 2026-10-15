import sizes from '../../shared/decor-scale.json';
import art from './decor-art-layout.json';
// Small dog: .34 scene height × 1.25 actor canvas × 269/348 visible sprite width.
export const REFERENCE_PET_LENGTH = .34 * 1.25 * 269 / 348;
export function roomDecorWidth(item, sceneHeight, sceneWidth) {
  const ratio=sizes[item.id]?.widthInPetLengths ?? .65;
  const bounds=art[item.id]?.bounds;
  const aspect=bounds ? bounds.width/bounds.height : 1;
  const scale=Number.isFinite(item.scale) ? item.scale : 1;
  // A shared world scale, independent of page, species selection and number of pets.
  return Math.min(sceneHeight*REFERENCE_PET_LENGTH*ratio*scale,sceneWidth*.8,sceneHeight*.85*aspect);
}
export const petActorSize = (height, size=.3) => height * size * 1.25;
