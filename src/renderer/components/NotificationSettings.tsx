import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPreferences } from "../../shared/models";

export function NotificationSettings({ notify }: { notify: (message: string) => void }) {
  const client = useQueryClient();
  const prefs = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => window.storePos.pos.notificationPreferences(),
    refetchInterval: 30_000,
  });

  const save = useMutation({
    mutationFn: (value: NotificationPreferences) =>
      window.storePos.pos.saveNotificationPreferences(value),
    onSuccess: (result, input) => {
      client.setQueryData(["notification-preferences"], result);
      if (
        (input.lowStock && !result.lowStock) ||
        (input.dailyEnabled && !result.dailyEnabled)
      ) {
        notify(
          "Notifications could not be enabled. Check this app’s notification permission in system settings.",
        );
      } else {
        notify("သတိပေးချက်ဆက်တင် ပြင်ပြီးပါပြီ");
      }
    },
    onError: (e: Error) => notify(e.message),
  });

  const value = prefs.data;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 text-base">ကွန်ပျူတာသတိပေးချက်</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Store POS ဖွင့်ထားစဉ် အသံနှင့် စနစ်သတိပေးချက်များ
        </p>
      </div>

      <div className="p-5 space-y-4">
        {value ? (
          <>
            {!value.supported && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                <span>⚠️</span>
                <span>စနစ်သတိပေးချက်ကို ပိတ်ထားသည် သို့မဟုတ် ဤစနစ်တွင် မပံ့ပိုးပါ။</span>
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50/60 transition-colors">
              <div className="flex items-center gap-3">
                <span className="text-xl p-2 bg-slate-100 rounded-lg">📦</span>
                <div>
                  <h4 className="text-sm font-medium text-slate-800">လက်ကျန်နည်း သတိပေးချက်</h4>
                  <p className="text-xs text-slate-500">
                    အရောင်းပြီးနောက် လက်ကျန်အနည်းဆုံးအရေအတွက် ရောက်လျှင် ချက်ချင်းသတိပေးမည်
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={value.lowStock}
                disabled={!value.supported || save.isPending}
                onChange={(e) =>
                  save.mutate({ ...value, lowStock: e.target.checked })
                }
              />
            </div>

            <div className="p-3 rounded-lg border border-slate-100 space-y-3 hover:bg-slate-50/60 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl p-2 bg-slate-100 rounded-lg">⏰</span>
                  <div>
                    <h4 className="text-sm font-medium text-slate-800">နေ့စဉ်အဆိုင်းပိတ်ရန် သတိပေးချက်</h4>
                    <p className="text-xs text-slate-500">
                      ငွေစာရင်းကိုက်ပြီး နေ့စဉ်အရောင်းစစ်ရန် ငွေကိုင်ကို သတိပေးမည်
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={value.dailyEnabled}
                  disabled={!value.supported || save.isPending}
                  onChange={(e) =>
                    save.mutate({ ...value, dailyEnabled: e.target.checked })
                  }
                />
              </div>

              {value.dailyEnabled && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">သတိပေးမည့်အချိန်</span>
                  <input
                    type="time"
                    className="input input-bordered input-xs max-w-[120px] font-mono text-center"
                    value={`${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`}
                    disabled={save.isPending}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [hour, minute] = e.target.value.split(":").map(Number);
                        save.mutate({ ...value, hour, minute });
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-slate-400 text-sm">
            သတိပေးချက်ဆက်တင် ဖတ်နေသည်…
          </div>
        )}
      </div>
    </div>
  );
}
