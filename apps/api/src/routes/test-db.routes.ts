import { Router } from "express";
import { supabase } from "../config/supabase";

const router = Router();

router.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("service_points")
    .select("id, name, type, sort_order, is_active")
    .order("sort_order");

  if (error) {
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }

  return res.status(200).json({
    status: "ok",
    count: data.length,
    data,
  });
});

export default router;