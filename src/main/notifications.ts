import { Notification } from 'electron';
import type { NotificationPreferences, Product } from '../shared/models';
import { PosDatabase } from './database';

/** Device-local, opt-in reminders. Notification failures never fail a sale. */
export class NotificationService {
  private active = new Set<Notification>();
  private ticking = false;
  constructor(private db: PosDatabase, private navigate: (page:'inventory'|'reports')=>void) {}
  preferences(): NotificationPreferences {
    const [hour,minute]=(this.db.getState('notify.daily.time') ?? '20:0').split(':').map(Number);
    return {lowStock:this.db.getState('notify.lowStock')==='1',dailyEnabled:this.db.getState('notify.daily.enabled')==='1',hour:Number.isInteger(hour)&&hour>=0&&hour<24?hour:20,minute:Number.isInteger(minute)&&minute>=0&&minute<60?minute:0,supported:Notification.isSupported()};
  }
  async save(input: NotificationPreferences): Promise<NotificationPreferences> {
    if (!this.db.capabilities().owner) throw new Error('Only the owner can configure reminders');
    if (!Number.isInteger(input.hour)||input.hour<0||input.hour>23||!Number.isInteger(input.minute)||input.minute<0||input.minute>59) throw new Error('Choose a valid reminder time');
    const old=this.preferences();
    let available=Notification.isSupported();
    if(available && ((input.lowStock&&!old.lowStock)||(input.dailyEnabled&&!old.dailyEnabled))) available=await this.show('Store POS reminders','Notifications are enabled on this desktop.','reports');
    this.db.setState('notify.lowStock',input.lowStock&&available?'1':'0');
    this.db.setState('notify.daily.enabled',input.dailyEnabled&&available?'1':'0');
    this.db.setState('notify.daily.time',`${input.hour}:${input.minute}`);
    return this.preferences();
  }
  async afterSale(before: Product[]): Promise<void> {
    if(!this.preferences().lowStock)return;
    const crossed=before.map(previous=>({previous,current:this.db.cartProducts([previous.id])[0]})).filter(({previous,current})=>current && previous.quantity>previous.minStock && current.quantity<=current.minStock);
    if(crossed.length)await this.show('Low stock',crossed.slice(0,4).map(({current})=>`${current!.name} — ${current!.quantity} ${current!.unit}`).join('\n'),'inventory');
  }
  async tick(date=new Date()): Promise<void> {
    if(this.ticking)return;
    const prefs=this.preferences();
    if(!prefs.dailyEnabled||date.getHours()*60+date.getMinutes()<prefs.hour*60+prefs.minute)return;
    const day=`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
    if(this.db.getState('notify.daily.lastDay')===day)return;
    this.ticking=true;
    try {
      if(await this.show("Today's sales",'Review today’s sales and profit.','reports'))this.db.setState('notify.daily.lastDay',day);
      else this.db.setState('notify.daily.enabled','0');
    } finally {this.ticking=false;}
  }
  private show(title:string,body:string,page:'inventory'|'reports'):Promise<boolean> {
    if(!Notification.isSupported())return Promise.resolve(false);
    return new Promise(resolve=>{
      let done=false;
      const finish=(value:boolean)=>{if(!done){done=true;clearTimeout(timer);resolve(value);}};
      const notification=new Notification({title,body});
      this.active.add(notification);
      const timer=setTimeout(()=>finish(false),5000);
      notification.once('show',()=>finish(true));
      notification.once('failed',()=>{this.active.delete(notification);finish(false);});
      notification.once('close',()=>this.active.delete(notification));
      notification.once('click',()=>{this.active.delete(notification);this.navigate(page);});
      try {notification.show();}catch {this.active.delete(notification);finish(false);}
    });
  }
}
