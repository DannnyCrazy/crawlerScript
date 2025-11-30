import * as ExcelJS from "exceljs";
import axios from "axios";
import https from "https";
import { formatTime } from "../utils/formatTime";

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

const token =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6NTM3NTg4MTgsIm5pY2tuYW1lIjoiZCIsImF2YXRhcl91cmwiOiJodHRwczovL21lZGlhMi5seWNoZWVyLm5ldC9wcm9jZXNzL2ltYWdlLzYzMDkxNDE2NjcyNzc4MDM1Mi84MDNmNzA3ZGY0MmIyZjk5ZmM3Y2JhZGNjZTMyMzY1MyIsInNleCI6IjEiLCJzdGF0dXMiOiJub3JtYWwiLCJzdWJzY3JpYmVkIjowLCJyb2xlIjoic3R1ZGVudCIsInRlbGVwaG9uZV92YWxpZGF0ZSI6ZmFsc2UsInR5cGUiOiJBY2NvdW50VG9rZW4iLCJ2ZXJzaW9uIjoiMS4wIiwibG9naW5fa2V5IjpudWxsLCJsb2dpbl93YXkiOm51bGwsImNsaWVudF9pcCI6IjExNi43LjEwNi4xMTMiLCJ0b2tlbl9rZXkiOiJNQzR4TURjMU9URTNOek13TXpBek9UTXpOZyIsImV4cCI6MTc2NDUwNzA3M30.kLURlZuKnX1J9gvgyAPRCjGw06hQyOvMVTHutGaHcnw.b.bdFyw9JfjyKGRXd-KG807dy4YjPSLFRxcdoMPoGxRK0";

const arrGroup: string[][] = [["36894301", "36894320"]];

interface CourseItem {
  index: number;
  title: string;
  courseId: string;
  type: string;
  llaUrl: string;
  courseType: string;
  result: "成功" | "失败" | "不解析";
  channelId?: string;
  channelName?: string;
  liveroomName?: string;
  lectureCount?: number;
  createTime?: string;
  updateTime?: string;
}

async function fetchCourseInfo(courseId: string, token: string): Promise<any> {
  const url = `https://apiv1.lizhiweike.com/api/lecture/${courseId}/info?token=${token}`;
  const response = await axiosInstance.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-cn",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36",
    },
  });
  return response.data;
}

async function fetchCourseDetails(
  liveroomId: string,
  lectureId: string,
  token: string
): Promise<any> {
  const url = `https://admin.lizhiweike.com/api/liverooms/${liveroomId}/lectures/${lectureId}?token=${token}&fresh=0.9539088513823641&level=normal_edit`;
  const response = await axiosInstance.get(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-cn",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36",
      Origin: "https://m.lizhiweike.com",
      Referer: `https://admin.lizhiweike.com/api/liverooms/${liveroomId}/lectures/${lectureId}?token=${token}`,
    },
  });
  return response.data;
}

async function processCourse(courseId: string, token: string): Promise<CourseItem> {
  const courseInfo = await fetchCourseInfo(courseId, token);
  if (courseInfo.code !== 0 || !courseInfo.data) throw new Error("Invalid course info");
  const liveroom = courseInfo.data.liveroom;
  const courseInfoLecture = courseInfo.data.lecture;

  if (courseInfoLecture.image_mode === "ppt") {
    console.log(`[${courseId}]:类型:ppt语音`);
    return {
      index: 1,
      title: courseInfo.data.lecture.name,
      courseId,
      type: "",
      llaUrl: "",
      courseType: "ppt语音",
      result: "不解析",
      channelId: courseInfo.data.channel?.id?.toString() || "",
      channelName: courseInfo.data.channel?.name || "",
      liveroomName: liveroom.name || "",
      lectureCount: courseInfo.data.channel?.channel_lecture_count || 0,
      createTime: formatTime(courseInfo.data.lecture?.create_time || ""),
      updateTime: formatTime(courseInfo.data.lecture?.update_time || ""),
    };
  }

  if (liveroom.verify_type === 2 || liveroom.verify_type === 1) {
    const liveroomId = liveroom.id;
    const liveroomName = liveroom.name;
    const channel_lecture_count = courseInfo.data.channel.channel_lecture_count;
    const courseDetails = await fetchCourseDetails(liveroomId, courseId, token);
    if (courseDetails.code !== 0 || !courseDetails.data || !courseDetails.data.lecture) {
      throw new Error("Invalid course details");
    }
    const lecture = courseDetails.data.lecture;
    const result = lecture.lla_url ? "成功" : "失败";
    const color = lecture.lla_url ? "\x1b[32m" : "\x1b[31m";
    console.log(`[${courseId}]:视频, 提取视频链接${color}${result}\x1b[0m`);
    return {
      index: 1,
      title: lecture.title || "",
      courseId,
      type: lecture.lla_type || "",
      llaUrl: lecture.lla_url || "",
      courseType: "视频",
      result,
      channelId: courseInfo.data.channel?.id?.toString() || "",
      channelName: courseInfo.data.channel?.name || "",
      liveroomName: liveroomName,
      lectureCount: channel_lecture_count,
      createTime: formatTime(lecture.create_time || ""),
      updateTime: formatTime(lecture.update_time || ""),
    };
  }

  if (courseInfo.data.audio_info) {
    console.log(`[${courseId}]:忽略`);
    return {
      index: 1,
      title: courseInfo.data.lecture.name,
      courseId,
      type: "",
      llaUrl: "",
      courseType: "audio语音",
      result: "不解析",
      channelId: courseInfo.data.channel?.id?.toString() || "",
      channelName: courseInfo.data.channel?.name || "",
      liveroomName: liveroom.name || "",
      lectureCount: courseInfo.data.channel?.channel_lecture_count || 0,
      createTime: formatTime(courseInfo.data.lecture?.create_time || ""),
      updateTime: formatTime(courseInfo.data.lecture?.update_time || ""),
    };
  }

  if (liveroom.verify_type === 0) {
    console.log(`[${courseId}]:忽略`);
    return {
      index: 1,
      title: courseInfo.data.lecture.name,
      courseId,
      type: "",
      llaUrl: "",
      courseType: "语音",
      result: "不解析",
      channelId: courseInfo.data.channel?.id?.toString() || "",
      channelName: courseInfo.data.channel?.name || "",
      liveroomName: liveroom.name || "",
      lectureCount: courseInfo.data.channel?.channel_lecture_count || 0,
      createTime: formatTime(courseInfo.data.lecture?.create_time || ""),
      updateTime: formatTime(courseInfo.data.lecture?.update_time || ""),
    };
  }

  console.log(`[${courseId}]:忽略`);
  return {
    index: 1,
    title: courseInfo.data.lecture.name,
    courseId,
    type: "",
    llaUrl: "",
    courseType: "未知",
    result: "不解析",
  };
}

async function exportToExcel(data: CourseItem[], outputPath?: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Course Data");
  worksheet.columns = [
    { header: "序号", key: "index", width: 10 },
    { header: "课程 id", key: "courseId", width: 10 },
    { header: "标题", key: "title", width: 30 },
    { header: "课程类型", key: "courseType", width: 15 },
    { header: "解析地址", key: "llaUrl", width: 50 },
    { header: "解析结果", key: "result", width: 10 },
    { header: "频道ID", key: "channelId", width: 15 },
    { header: "频道名称", key: "channelName", width: 25 },
    { header: "直播间名称", key: "liveroomName", width: 25 },
    { header: "课程数量", key: "lectureCount", width: 12 },
    { header: "创建时间", key: "createTime", width: 20 },
    { header: "更新时间", key: "updateTime", width: 20 },
  ];
  worksheet.addRows(data);
  const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
  const fileName = outputPath || `course_data_${timestamp}.xlsx`;
  await workbook.xlsx.writeFile(fileName);
  console.log(`[完成] 数据已导出到: ${fileName}`);
  return fileName;
}

async function main(courseIds: string[]) {
  console.log("=== 爬虫工具启动(Tauri版) ===");
  const startId = courseIds[0];
  const endId = courseIds[courseIds.length - 1];
  const outputPath = `${startId}-${endId}.xlsx`;
  console.log(`[步骤1] 开始爬取课程，共${courseIds.length}个课程ID`);
  console.log(`[配置] 输出文件路径: ${outputPath}`);

  let allCourseData: CourseItem[] = [];
  let successCount = 0;
  let failedCount = 0;
  let notParsedCount = 0;

  for (let i = 0; i < courseIds.length; i++) {
    const courseId = courseIds[i]!;
    console.log(`正在处理 id:${courseId}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      const courseData = await processCourse(courseId, token);
      courseData.index = allCourseData.length + 1;
      allCourseData.push(courseData);
      if (courseData.result === "失败") failedCount++;
      else if (courseData.result === "不解析") notParsedCount++;
      else successCount++;
    } catch {
      allCourseData.push({
        index: allCourseData.length + 1,
        title: "",
        courseId,
        type: "",
        llaUrl: "",
        courseType: "",
        result: "不解析",
        channelId: "",
        channelName: "",
        liveroomName: "",
        lectureCount: 0,
        createTime: "",
        updateTime: "",
      });
      notParsedCount++;
    }
  }

  const excelPath = await exportToExcel(allCourseData, outputPath);
  console.log("=== 爬虫工具结束(Tauri版) ===");
  return excelPath;
}

const batchCrawler = async () => {
  for (const group of arrGroup) {
    const [start, end] = group;
    const step = 3000;
    for (let s = Number(start); s <= Number(end); s += step) {
      const e = Math.min(s + step - 1, Number(end));
      const courseIds = Array.from({ length: e - s + 1 }, (_, i) => (s + i).toString());
      await main(courseIds);
    }
  }
};

batchCrawler();
