import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

// 将UTC时间转换为北京时间（YYYY/MM/DD HH:mm:ss）
// 使用插件
dayjs.extend(utc);
dayjs.extend(timezone);

function formatTime(utcTime: string): string {
  if (!utcTime) return "";
  // 将UTC时间转换为北京时间（UTC+8）
  return dayjs.utc(utcTime).tz("Asia/Shanghai").format("YYYY/MM/DD HH:mm:ss");
}

export { formatTime };

export default formatTime;  
