/* Phân công chuyên môn theo file "LIME checklist chuyên môn" (ô không đỏ = người đó phải làm). */
export const PEOPLE = {
  nguyenthihong2609: { name: 'Hồng', classes: ['PET B1', 'CLC A1E', 'CLC A1F', 'DORY0X'] },
  nguyenlieu2901: { name: 'Liễu', classes: ['PET B1', 'CLC A1E', 'CLC A1F', 'DORY0X'] },
  nguyenhongngoc26: { name: 'Ruby', classes: ['CLC A2E', 'CAM1S', 'CAM2M', 'CAM1R', 'FCE B2A', 'CLC A2G', 'DORY2H', 'CAM1T', 'CLC A1D', 'CAM2N'] },
  buithimaiphuong2409: { name: 'Mai Phương', classes: ['CAM2P', 'CLC A2D', 'DORY1M', 'GRAM1A', 'CAM2Q', 'DORY1K', 'DORY0Y', '3CLC A2H', '3CLC A2K', '3CLC A2F', '3DORY0T', '3DORY0Z', '3DORY02R', '3DORY02S', '3DORY2D', '3DORY3B', '3CAM2F', '3CAM1V', '3CAM2E'] },
};
const HL = ['nguyenthihong2609', 'nguyenlieu2901'];
const ALL = Object.keys(PEOPLE);
const HL_ONLY = ['t03', 't04', 't05', 't32', 't35', 't43', 't45', 't47', 't50'];
const MP_ONLY = ['t16'];
/** tplId -> danh sách username được giao */
export function tplAssign(tplId) {
  if (HL_ONLY.includes(tplId)) return HL;
  if (MP_ONLY.includes(tplId)) return ['buithimaiphuong2409'];
  return ALL;
}
