/* Phân công chuyên môn (theo file "LIME checklist chuyên môn" + trả lời của người dùng).
   - Việc riêng của từng người: Check CVPS, đọc tin nhắn nhóm.
   - Việc học thuật theo người: Ruby, Mai Phương (kiểm tra báo cáo + soạn văn chia đều các lớp trong 2 tuần).
   - Việc hành chính: mỗi cơ sở 1 người kiểm tra (Yên Hòa: Liễu, Trung Hòa: Mai Phương).
   Hồng nghỉ từ tháng 11. */
export const PEOPLE = {
  nguyenlieu2901: { nick: 'Liễu', type: 'hc', cmFacilities: ['yenhoa'], classes: [] },
  nguyenhongngoc26: { nick: 'Ruby', type: 'ht', cmFacilities: ['yenhoa'], classes: ['CLC A2E', 'CAM1S', 'CAM2M', 'CAM1R', 'FCE B2A', 'CLC A2G', 'DORY2H', 'CAM1T', 'CLC A1D', 'CAM2N'] },
  buithimaiphuong2409: { nick: 'Mai Phương', type: 'ht', cmFacilities: ['yenhoa', 'trunghoa'], classes: ['CAM2P', 'CLC A2D', 'DORY1M', 'GRAM1A', 'CAM2Q', 'DORY1K', 'DORY0Y', '3CLC A2H', '3CLC A2K', '3CLC A2F', '3DORY0T', '3DORY0Z', '3DORY02R', '3DORY02S', '3DORY2D', '3DORY3B', '3CAM2F', '3CAM1V', '3CAM2E'] },
};
export const LEFT = ['nguyenthihong2609']; // đã nghỉ: khóa tài khoản + xóa việc chưa làm từ hôm nay
const PERSONAL = ['t01', 't02'];                               // mỗi người tự làm
const ACADEMIC = { t12: 'rotate', t19: 'ht', t37: 'ht', t38: 'ht', t39: 'ht', t49: ['nguyenhongngoc26'], t16: ['buithimaiphuong2409'] }; // học thuật
const ALLP = Object.keys(PEOPLE);
const HT = ['nguyenhongngoc26', 'buithimaiphuong2409'];
const HC_BY_FAC = { yenhoa: ['nguyenlieu2901'], trunghoa: ['buithimaiphuong2409'] };
/** Kế hoạch giao một mẫu việc chuyên môn: { assignees?: [username], byFac?: {fac:[username]}, rotate? } */
export function tplPlan(tplId) {
  if (PERSONAL.includes(tplId)) return { assignees: ALLP };
  if (tplId in ACADEMIC) {
    const v = ACADEMIC[tplId];
    return { assignees: Array.isArray(v) ? v : HT, rotate: v === 'rotate' };
  }
  return { byFac: HC_BY_FAC };
}
