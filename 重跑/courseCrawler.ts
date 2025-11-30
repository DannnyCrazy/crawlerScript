import * as ExcelJS from "exceljs";
import axios from "axios";
import https from "https";

// 配置：Token 与需要爬取的数据分组
const token =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6NTM3NTg4MTgsIm5pY2tuYW1lIjoiZCIsImF2YXRhcl91cmwiOiJodHRwczovL21lZGlhMi5seWNoZWVyLm5ldC9wcm9jZXNzL2ltYWdlLzYzMDkxNDE2NjcyNzc4MDM1Mi84MDNmNzA3ZGY0MmIyZjk5ZmM3Y2JhZGNjZTMyMzY1MyIsInNleCI6IjEiLCJzdGF0dXMiOiJub3JtYWwiLCJzdWJzY3JpYmVkIjowLCJyb2xlIjoic3R1ZGVudCIsInRlbGVwaG9uZV92YWxpZGF0ZSI6ZmFsc2UsInR5cGUiOiJBY2NvdW50VG9rZW4iLCJ2ZXJzaW9uIjoiMS4wIiwibG9naW5fa2V5IjpudWxsLCJsb2dpbl93YXkiOm51bGwsImNsaWVudF9pcCI6IjExNi43LjEwNi4xMTMiLCJ0b2tlbl9rZXkiOiJNQzR4TURjMU9URTNOek13TXpBek9UTXpOZyIsImV4cCI6MTc2NDUwNzA3M30.kLURlZuKnX1J9gvgyAPRCjGw06hQyOvMVTHutGaHcnw.b.bdFyw9JfjyKGRXd-KG807dy4YjPSLFRxcdoMPoGxRK0";

const arrGroup: string[][] = [["36894001", "37000000"]];

interface CourseItem {
  index: number;
  title: string;
  courseId: string;
  type: string;
  llaUrl: string;
  courseType: string; // 添加课程类型字段：视频或语音
  result: "成功" | "失败" | "不解析"; // 添加解析结果字段：成功或失败或不解析
  channelId: string; // 添加频道ID
  channelName: string; // 添加频道名称
  liveroomName: string; // 添加直播间名称
  lectureCount: number; // 添加课程数量
  createTime: string; // 创建时间（北京时间 YYYY/MM/DD HH:mm:ss）
  updateTime: string; // 更新时间（北京时间 YYYY/MM/DD HH:mm:ss）
}

// 创建自定义的axios实例，禁用SSL证书验证
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

// 将UTC时间转换为北京时间（YYYY/MM/DD HH:mm:ss）
function formatBeijingTime(utcTime: string): string {
  if (!utcTime) return "";

  const date = new Date(utcTime);
  // 转换为北京时间（UTC+8）
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);

  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, "0");
  const day = String(beijingTime.getDate()).padStart(2, "0");
  const hours = String(beijingTime.getHours()).padStart(2, "0");
  const minutes = String(beijingTime.getMinutes()).padStart(2, "0");
  const seconds = String(beijingTime.getSeconds()).padStart(2, "0");

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

async function fetchCourseInfo(courseId: string, token: string): Promise<any> {
  const url = `https://apiv1.lizhiweike.com/api/lecture/${courseId}/info?token=${token}`;

  try {
    // 使用自定义的axios实例发送请求，忽略SSL证书验证
    const response = await axiosInstance.get(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-cn",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36",
      },
    });

    return response.data;
  } catch (error) {
    console.error("[info接口] 获取课程信息失败:");
    throw error;
  }
}

async function fetchCourseDetails(
  liveroomId: string,
  lectureId: string,
  token: string
): Promise<any> {
  const url = `https://admin.lizhiweike.com/api/liverooms/${liveroomId}/lectures/${lectureId}?token=${token}&fresh=0.9539088513823641&level=normal_edit`;

  try {
    // 使用自定义的axios实例发送请求，忽略SSL证书验证
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
  } catch (error) {
    console.error("[API请求] 获取课程详细信息失败:");
    throw error;
  }
}

async function processCourse(
  courseId: string,
  token: string
): Promise<CourseItem[]> {
  try {
    // 获取课程基本信息
    const courseInfo = await fetchCourseInfo(courseId, token);

    if (courseInfo.code !== 0 || !courseInfo.data) {
      throw new Error("Failed to fetch course info or invalid response");
    }

    const liveroom = courseInfo.data.liveroom;
    const courseInfoLecture = courseInfo.data.lecture;

    // 判断课程类型：verify_type === 2是视频，verify_type === 1是语音
    let courseType = "未知";

    let result: CourseItem = {
      index: 1, // 默认为1，如果有多个课程，可以在外部函数中设置
      title: "",
      courseId: courseId,
      type: "",
      llaUrl: "",
      courseType: courseType, // 添加课程类型字段：视频或语音
      result: "不解析", // 添加解析结果字段：成功或失败或不解析
    };
    if (courseInfoLecture.image_mode === "ppt") {
      courseType = "ppt语音";
      result = {
        index: 1, // 默认为1，如果有多个课程，可以在外部函数中设置
        title: courseInfo.data.lecture.name,
        courseId: courseId,
        type: "",
        llaUrl: "",
        courseType: courseType, // 添加课程类型字段：语音
        result: "不解析", // 添加解析结果字段：成功或失败或不解析
        channelId: courseInfo.data.channel?.id?.toString() || "",
        channelName: courseInfo.data.channel?.name || "",
        liveroomName: liveroom.name || "",
        lectureCount: courseInfo.data.channel?.channel_lecture_count || 0,
        createTime: formatBeijingTime(
          courseInfo.data.lecture?.create_time || ""
        ),
        updateTime: formatBeijingTime(
          courseInfo.data.lecture?.update_time || ""
        ),
      };
    } else if (liveroom.verify_type === 2 || liveroom.verify_type === 1) {
      courseType = "视频";
      if (courseType === "视频") {
        // 提取liveroomId
        const liveroomId = liveroom.id;
        const liveroomName = liveroom.name;
        const channel_lecture_count =
          courseInfo.data.channel.channel_lecture_count;

        // 获取课程详细信息
        const courseDetails = await fetchCourseDetails(
          liveroomId,
          courseId,
          token
        );

        if (
          courseDetails.code !== 0 ||
          !courseDetails.data ||
          !courseDetails.data.lecture
        ) {
          console.error("[数据处理] 获取课程详细信息失败或响应无效");
          throw new Error("Failed to fetch course details or invalid response");
        }

        const lecture = courseDetails.data.lecture;

        // 构建结果对象
        result = {
          index: 1, // 默认为1，如果有多个课程，可以在外部函数中设置
          title: lecture.title || "",
          courseId: courseId,
          type: lecture.lla_type || "",
          llaUrl: lecture.lla_url || "",
          courseType: courseType, // 添加课程类型字段：视频
          result: lecture.lla_url ? "成功" : "失败", // 添加解析结果字段：成功或失败
          channelId: courseInfo.data.channel?.id?.toString() || "",
          channelName: courseInfo.data.channel?.name || "",
          liveroomName: liveroomName,
          lectureCount: channel_lecture_count,
          createTime: formatBeijingTime(lecture.create_time || ""),
          updateTime: formatBeijingTime(lecture.update_time || ""),
        };
      }
    } else if (courseInfo.data.audio_info) {
      courseType = "audio语音";
      result = {
        index: 1, // 默认为1，如果有多个课程，可以在外部函数中设置
        title: courseInfo.data.lecture.name,
        courseId: courseId,
        type: "",
        llaUrl: "",
        courseType: courseType, // 添加课程类型字段：语音
        result: "不解析", // 添加解析结果字段：成功或失败或不解析
        channelId: courseInfo.data.channel?.id?.toString() || "",
        channelName: courseInfo.data.channel?.name || "",
        liveroomName: liveroom.name || "",
        lectureCount: courseInfo.data.channel?.channel_lecture_count || 0,
        createTime: formatBeijingTime(
          courseInfo.data.lecture?.create_time || ""
        ),
        updateTime: formatBeijingTime(
          courseInfo.data.lecture?.update_time || ""
        ),
      };
    } else if (liveroom.verify_type === 0) {
      courseType = "语音";
      result = {
        index: 1, // 默认为1，如果有多个课程，可以在外部函数中设置
        title: courseInfo.data.lecture.name,
        courseId: courseId,
        type: "",
        llaUrl: "",
        courseType: courseType, // 添加课程类型字段：语音
        result: "不解析", // 添加解析结果字段：成功或失败或不解析
        channelId: courseInfo.data.channel?.id?.toString() || "",
        channelName: courseInfo.data.channel?.name || "",
        liveroomName: liveroom.name || "",
        lectureCount: courseInfo.data.channel?.channel_lecture_count || 0,
        createTime: formatBeijingTime(
          courseInfo.data.lecture?.create_time || ""
        ),
        updateTime: formatBeijingTime(
          courseInfo.data.lecture?.update_time || ""
        ),
      };
    }

    return [result];
  } catch (error) {
    throw error;
  }
}

async function exportToExcel(
  data: CourseItem[],
  outputPath?: string
): Promise<string> {
  try {
    // 创建工作簿和工作表
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Course Data");

    // 添加表头
    worksheet.columns = [
      { header: "序号", key: "index", width: 10 },
      { header: "课程 id", key: "courseId", width: 10 },
      { header: "标题", key: "title", width: 30 },
      // { header: "类型", key: "type", width: 20 },
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

    // 添加数据
    worksheet.addRows(data);

    // 写入文件
    await workbook.xlsx.writeFile(outputPath!);

    console.log(`[Excel导出] Excel文件已保存到: ${outputPath}`);
    return outputPath!;
  } catch (error) {
    console.error("[Excel导出] 导出Excel时出错:");
    throw error;
  }
}

async function main(courseIds: string[]) {
  try {
    console.log("=== 爬虫工具启动 ===");

    // 使用顶部配置的 token

    // 生成文件名：开始-结束.xlsx
    const startId = courseIds[0];
    const endId = courseIds[courseIds.length - 1];
    const outputPath = `${startId}-${endId}.xlsx`;

    console.log(`[步骤1] 开始爬取课程，共${courseIds.length}个课程ID`);
    console.log(`[配置] 输出文件路径: ${outputPath}`);

    // 创建一个数组来存储所有课程的数据
    let allCourseData: CourseItem[] = [];
    let successCount = 0;
    let errorCount = 0;

    // 遍历每个课程ID并处理
    for (let i = 0; i < courseIds.length; i++) {
      const courseId = courseIds[i];
      console.log(
        `[处理进度] 正在处理第${i + 1}/${
          courseIds.length
        }个课程，ID: ${courseId}`
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      try {
        const courseData = await processCourse(courseId, token);

        // 更新序号
        courseData.forEach((item, index) => {
          item.index = allCourseData.length + index + 1;
        });

        // 将当前课程数据添加到总数据中
        allCourseData = [...allCourseData, ...courseData];
        successCount++;
      } catch (error) {
        // 添加错误记录到数据中
        allCourseData.push({
          index: allCourseData.length + 1,
          title: "",
          courseId: courseId,
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
        errorCount++;
      }
    }

    console.log(
      `[步骤2] 所有课程数据处理完成，成功: ${successCount}，失败: ${errorCount}，共获取到${allCourseData.length}条记录`
    );

    // 导出到Excel
    console.log("[步骤3] 开始导出数据到Excel...");
    const excelPath = await exportToExcel(allCourseData, outputPath);

    console.log("[完成] 爬取任务已成功完成!");
    console.log(`[完成] 数据已导出到: ${excelPath}`);
    console.log("=== 爬虫工具结束 ===");
  } catch (error) {
    console.error("[错误] 发生异常:");
    process.exit(1);
  }
}

const batchCrawler = async () => {
  // 使用顶部配置的分组 arrGroup
  for (const group of arrGroup) {
    const [start, end] = group;
    const total = Number(end) - Number(start) + 1;
    const step = 3000; // 每组3000个
    let current = Number(start);

    while (current <= Number(end)) {
      const batchEnd = Math.min(current + step - 1, Number(end));
      const courseIds = Array.from({ length: batchEnd - current + 1 }, (_, i) =>
        (current + i).toString()
      );
      await main(courseIds);
      current = batchEnd + 1;

      // 组间间隔10秒
      if (current <= Number(end)) {
        console.log(`[批次间隔] 等待10秒后处理下一组...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }
};

batchCrawler();
