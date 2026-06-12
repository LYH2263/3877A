import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <main className="mx-auto mt-8 w-full max-w-3xl px-4 pb-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>{description}</p>
          <p>当前版本已将核心精力放在发现页、互动闭环和搜索体验上，这里保留为明确的功能入口。</p>
          <Button asChild>
            <Link to="/">返回发现页</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
