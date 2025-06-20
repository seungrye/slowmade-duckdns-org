import { connectToDB } from "./db";
import Post from "@/models/post";
import { GetPostTimelineType } from "@/types/archive.d";
import { PipelineStage } from "mongoose";

export async function getPostTimeline(): Promise<GetPostTimelineType[]> {
    await connectToDB();

    const pipeline: PipelineStage[] = [{
        $group: {
            _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" }
            },
            count: { $sum: 1 },
            ids: { $push: "$_id" }
        }
    },
    {
        $sort: {
            "_id.year": -1,
            "_id.month": -1
        }
    },
    {
        $project: {
            _id: 0,
            year: "$_id.year",
            month: "$_id.month",
            count: 1,
            ids: 1
        }
    }];

    const result = await Post.aggregate(pipeline);

    return result;
}
